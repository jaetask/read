import type { Calls } from "@jaetask/open-agent-kit";
import type { WebSocket } from "ws";
import type { Agent } from "./agent.js";
import { readBrain } from "./brain.js";
import type { Turns } from "./chat/turns.js";
import type { Reader } from "./reader/reader.js";
import { type SttProvider, type TtsProvider, VoiceLoop } from "./voice/index.js";

export type VoiceDeps = {
  reader: Reader;
  calls: Calls;
  agent: Agent | undefined;
  turns: Turns;
  owner: string;
  stt: () => SttProvider;
  tts: () => TtsProvider;
  voice?: string | undefined;
  speed: number;
  gapMs: number;
  vocabulary?: string | undefined;
  pronunciations: () => [string, string][];
};

type FromPage =
  | { type: "text"; text: string }
  | { type: "mic"; on: boolean }
  | { type: "stop" }
  | { type: "speakers"; on: boolean };

export function voiceSocket(ws: WebSocket, deps: VoiceDeps): void {
  const { reader } = deps;
  const send = (o: object) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(o));
  };
  let source: "voice" | "typed" = "voice";
  let mic = false;
  const brain = readBrain({
    reader,
    calls: deps.calls,
    agent: deps.agent,
    turns: deps.turns,
    owner: deps.owner,
    note: (text) => send({ type: "note", text }),
    source: () => source,
  });
  const loop = new VoiceLoop({
    stt: deps.stt(),
    tts: deps.tts(),
    brain: {
      async *reply(text, options) {
        reader.defer();
        yield* brain.reply(text, options);
      },
    },
    ...(deps.voice ? { voice: deps.voice } : {}),
    speed: deps.speed,
    gapMs: deps.gapMs,
    pronunciations: deps.pronunciations(),
    ...(deps.vocabulary ? { vocabulary: deps.vocabulary } : {}),
    onAudio: (pcm) => {
      if (ws.readyState === ws.OPEN) ws.send(pcm);
    },
    onEvent: async (e) => {
      if (e.type === "state") send({ type: "state", state: e.state });
      else if (e.type === "heard") send({ type: "heard", text: e.text });
      else if (e.type === "token") send({ type: "token", text: e.text });
      else if (e.type === "barge") {
        await reader.stop();
        send({ type: "hush" });
      } else if (e.type === "error") send({ type: "error", text: e.text });
      else if (e.type === "done") {
        send({ type: "done", text: e.text, interrupted: e.interrupted });
        await reader.release(!e.interrupted);
      }
    },
  });
  const sound = {
    audio: (pcm: Uint8Array) => {
      if (ws.readyState === ws.OPEN) ws.send(pcm);
    },
    playing: (ms: number) => loop.playing(ms),
  };
  const textOnly = async (text: string) => {
    send({ type: "heard", text });
    let reply = "";
    for await (const piece of brain.reply(text, { signal: new AbortController().signal })) {
      if (typeof piece !== "string") continue;
      reply += piece;
      send({ type: "token", text: piece });
    }
    send({ type: "done", text: reply.trim(), interrupted: false });
  };
  reader.speakThrough(sound);
  const unlisten = reader.listen({ send });

  ws.on("message", (data, binary) => {
    if (binary) {
      if (mic) void loop.feed(new Uint8Array(data as Buffer));
      return;
    }
    let m: FromPage;
    try {
      m = JSON.parse(String(data)) as FromPage;
    } catch {
      return;
    }
    if (m.type === "mic") {
      mic = m.on;
      if (!mic) loop.detector.reset();
    } else if (m.type === "speakers" && m.on) reader.speakThrough(sound);
    else if (m.type === "stop") {
      void loop.interrupt();
      void reader.stop();
      send({ type: "hush" });
    } else if (m.type === "text" && m.text.trim() && reader.state.playing) {
      source = "typed";
      void textOnly(m.text.trim()).finally(() => {
        source = "voice";
      });
    } else if (m.type === "text" && m.text.trim()) {
      source = "typed";
      void loop.say(m.text.trim()).finally(() => {
        source = "voice";
      });
    }
  });
  ws.on("close", () => {
    unlisten();
    if (reader.speaking === sound) {
      void reader.stop();
      reader.speakThrough(undefined);
    }
    void loop.close();
  });
}
