import type { Calls } from "@jaetask/open-agent-kit";
import type { WebSocket } from "ws";
import type { Agent } from "./agent.js";
import { readBrain } from "./brain.js";
import type { Trace } from "./chat/trace.js";
import type { Turns } from "./chat/turns.js";
import type { Reader } from "./reader/reader.js";
import { type SttProvider, type Timings, type TtsProvider, VoiceLoop } from "./voice/index.js";

export type VoiceDeps = {
  reader: Reader;
  calls: Calls;
  agent: Agent | undefined;
  model: string | null;
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
  | { type: "call"; on: boolean }
  | { type: "hold"; on: boolean }
  | { type: "stop" };

export function voiceSocket(ws: WebSocket, deps: VoiceDeps): void {
  const { reader } = deps;
  const send = (o: object) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(o));
  };
  let source: "voice" | "typed" = "voice";
  let onCall = false;
  let held: Uint8Array[] | undefined;
  let saved: Trace | undefined;
  const brain = readBrain({
    reader,
    calls: deps.calls,
    agent: deps.agent,
    owner: deps.owner,
    note: (text) => send({ type: "note", text }),
    source: () => source,
  });

  const keep = (timings: Timings, interrupted: boolean, fallback: string) => {
    const trace = brain.trace;
    if (!trace || trace === saved || !trace.said) return;
    saved = trace;
    const detail = trace.detail(timings, deps.model, interrupted);
    const turn = deps.turns.add({
      file: reader.state.path ?? "",
      said: trace.said,
      reply: trace.reply || fallback,
      how: trace.how,
      source,
      detail,
    });
    send({ type: "turn", id: turn.id, timings: detail.timings, model: detail.model });
  };

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
        keep(e.timings, e.interrupted, e.text);
        send({ type: "done", text: e.text, interrupted: e.interrupted });
        source = "voice";
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
    const started = performance.now();
    send({ type: "heard", text });
    let reply = "";
    for await (const piece of brain.reply(text, { signal: new AbortController().signal })) {
      if (typeof piece !== "string") continue;
      reply += piece;
      send({ type: "token", text: piece });
    }
    keep({ total: (performance.now() - started) / 1000 }, false, reply.trim());
    send({ type: "done", text: reply.trim(), interrupted: false });
    source = "voice";
  };

  reader.speakThrough(sound);
  const unlisten = reader.listen({ send });

  ws.on("message", (data, binary) => {
    if (binary) {
      const pcm = new Uint8Array(data as Buffer);
      if (held) held.push(pcm);
      else if (onCall) void loop.feed(pcm);
      return;
    }
    let m: FromPage;
    try {
      m = JSON.parse(String(data)) as FromPage;
    } catch {
      return;
    }
    if (m.type === "call") {
      onCall = m.on;
      loop.detector.reset();
      send({ type: "state", state: onCall ? "listening" : "idle" });
    } else if (m.type === "hold") {
      if (m.on) {
        held = [];
        void loop.interrupt();
        void reader.stop();
        send({ type: "hush" });
      } else if (held) {
        const parts = held;
        held = undefined;
        const size = parts.reduce((n, p) => n + p.byteLength, 0);
        if (size < 16000 * 2 * 0.25) return void send({ type: "state", state: "idle" });
        const pcm = new Uint8Array(size);
        let at = 0;
        for (const p of parts) {
          pcm.set(p, at);
          at += p.byteLength;
        }
        source = "voice";
        void loop.clip(pcm);
      }
    } else if (m.type === "stop") {
      void loop.interrupt();
      void reader.stop();
      send({ type: "hush" });
    } else if (m.type === "text" && m.text.trim()) {
      source = "typed";
      if (reader.state.playing) void textOnly(m.text.trim());
      else void loop.say(m.text.trim());
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
