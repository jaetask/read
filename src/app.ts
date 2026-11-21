import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { DatabaseSync } from "node:sqlite";
import { provide } from "@jaetask/open-agent-kit";
import { type App, createApp } from "@jaetask/open-agent-kit/app";
import { nodeListener } from "@jaetask/open-agent-kit/mcp";
import { modelsFromEnv } from "@jaetask/open-agent-kit/pi";
import { WebSocketServer } from "ws";
import { type Agent, openAgent } from "./agent.js";
import { sqliteTurns, type Turns } from "./chat/turns.js";
import { library } from "./files/library.js";
import { readerDomain } from "./reader/domain.js";
import { positions, Reader } from "./reader/reader.js";
import { VERSION } from "./version.js";
import {
  kokoro,
  kokoroStream,
  parsePronunciations,
  type SttProvider,
  type TtsProvider,
  whisper,
} from "./voice/index.js";
import { voiceSocket } from "./voice-socket.js";

export type ReadOptions = {
  dataDir: string;
  filesDir: string;
  page?: string;
  connect?: string[];
  env?: NodeJS.ProcessEnv;
  stt?: () => SttProvider;
  tts?: () => TtsProvider;
  log?: (line: string) => void;
};

export type Read = App & { reader: Reader; agent: Agent | undefined };

const OWNER = "owner";
const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

function voiceFrom(env: NodeJS.ProcessEnv) {
  const studio = (env.VOICESTUDIO_URL ?? "http://127.0.0.1:3900").replace(/\/$/, "");
  const pronunciations = (): [string, string][] => {
    if (!env.READ_PRONUNCIATIONS) return [];
    try {
      return parsePronunciations(readFileSync(env.READ_PRONUNCIATIONS, "utf8"));
    } catch {
      return [];
    }
  };
  return {
    stt: () => whisper({ baseUrl: studio }),
    tts: (): TtsProvider =>
      env.READ_TTS === "kokoro-http"
        ? kokoro({ baseUrl: studio })
        : kokoroStream({ url: `${studio.replace(/^http/, "ws")}/ws/tts` }),
    voice: env.READ_VOICE,
    speed: Number(env.READ_SPEED ?? 0.94),
    gapMs: Number(env.READ_GAP_MS ?? 250),
    vocabulary: env.READ_ASR_VOCAB,
    pronunciations,
  };
}

export async function createRead(options: ReadOptions): Promise<Read> {
  const env = options.env ?? process.env;
  const log = options.log ?? console.log;
  const voice = voiceFrom(env);
  const stt = options.stt ?? voice.stt;
  const tts = options.tts ?? voice.tts;
  const reader = new Reader(library(options.filesDir), { ...voice, tts });
  let turns: Turns | undefined;
  let agent: Agent | undefined;
  const turnsOf = (db: DatabaseSync) => {
    turns ??= sqliteTurns(db);
    return turns;
  };
  const secret = randomBytes(24).toString("base64url");
  const app = await createApp({
    name: "read",
    version: VERSION,
    file: `${options.dataDir}/app.db`,
    domains: [
      provide(readerDomain, (db: DatabaseSync) => ({
        reader,
        turns: turnsOf(db),
        onMove: async (from: string, to: string) => {
          await agent?.rename(from, to);
        },
      })),
    ],
    owner: { id: OWNER },
    log,
    setupSecret: secret,
    ...(options.connect ? { connect: options.connect } : {}),
    ...(options.page ? { page: options.page } : {}),
  });
  reader.keepPlaces(positions(app.db));
  const chat = turnsOf(app.db);

  const choice = await modelsFromEnv(env);
  log(choice.note);
  agent = choice.ready
    ? await openAgent({
        dataDir: options.dataDir,
        models: choice.models,
        model: choice.model,
        reader,
        calls: () => app.calls,
        owner: OWNER,
      })
    : undefined;

  const started = await app.fetch(
    new Request("http://localhost/api/session", {
      method: "POST",
      headers: { "x-kit-request": "1", "content-type": "application/json" },
      body: JSON.stringify({ secret }),
    }),
  );
  const session = (started.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

  const local = (request: Request): Promise<Response> => {
    if (new URL(request.url).pathname.startsWith("/mcp")) return app.fetch(request);
    const headers = new Headers(request.headers);
    headers.set("cookie", [headers.get("cookie"), session].filter(Boolean).join("; "));
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : request.body;
    return app.fetch(
      new Request(request.url, {
        method: request.method,
        headers,
        ...(body ? { body, duplex: "half" } : {}),
      } as RequestInit),
    );
  };

  const sameMachine = (req: IncomingMessage): boolean => {
    const origin = req.headers.origin;
    return !origin || new URL(origin).host === req.headers.host;
  };

  const sockets = new WebSocketServer({ noServer: true });
  let http: Server | undefined;
  return {
    ...app,
    fetch: local,
    reader,
    agent,
    listen: async (port, host = "127.0.0.1") => {
      if (!LOOPBACK.has(host))
        throw new Error(
          `Read runs on this machine only: HOST must be 127.0.0.1, ::1 or localhost, not ${host}.`,
        );
      http = createServer(nodeListener(local));
      http.on("upgrade", (req, socket, head) => {
        if (new URL(req.url ?? "/", "http://x").pathname !== "/voice") return void socket.destroy();
        if (!sameMachine(req)) {
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          return void socket.destroy();
        }
        sockets.handleUpgrade(req, socket, head, (ws) =>
          voiceSocket(ws, {
            ...voice,
            reader,
            calls: app.calls,
            agent,
            turns: chat,
            owner: OWNER,
            stt,
            tts,
          }),
        );
      });
      await new Promise<void>((resolve) => http?.listen(port, host, resolve));
      return `http://${host}:${(http.address() as AddressInfo).port}`;
    },
    close: async () => {
      await reader.stop();
      for (const ws of sockets.clients) ws.terminate();
      if (http) {
        http.closeAllConnections();
        await new Promise((resolve) => http?.close(resolve));
      }
      await agent?.close();
      await app.close();
    },
  };
}
