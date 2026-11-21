import { useSyncExternalStore } from "react";
import { createAudioContext, MicCapture, micErrorMessage, openMic, PcmPlayer } from "./audio";

export type Line = { id: string; from: "person" | "reader"; text: string; live?: boolean };

export type VoiceState =
  | "idle"
  | "recording"
  | "busy"
  | "listening"
  | "hearing"
  | "thinking"
  | "speaking";

export type VoiceView = {
  connected: boolean;
  path: string | null;
  index: number;
  playing: boolean;
  heard: { index: number; text: string } | null;
  onCall: boolean;
  state: VoiceState;
  lines: Line[];
  error: string | null;
  timings: Record<string, number> | null;
  model: string | null;
  turns: number;
};

type FromServer =
  | { type: "reader"; path: string | null; index: number; playing: boolean; finished?: boolean }
  | { type: "sentence"; path: string; index: number; sentence: number; text: string }
  | { type: "hush" }
  | { type: "note"; text: string }
  | { type: "heard"; text: string }
  | { type: "token"; text: string }
  | { type: "done"; text: string; interrupted: boolean }
  | { type: "turn"; id: number; timings: Record<string, number>; model: string | null }
  | { type: "state"; state: "listening" | "hearing" | "thinking" | "speaking" | "idle" }
  | { type: "error"; text: string };

const MIC_RATE = 16000;
const OUT_RATE = 24000;

let view: VoiceView = {
  connected: false,
  path: null,
  index: 0,
  playing: false,
  heard: null,
  onCall: false,
  state: "idle",
  lines: [],
  error: null,
  timings: null,
  model: null,
  turns: 0,
};
const watchers = new Set<() => void>();
const set = (patch: Partial<VoiceView>) => {
  view = { ...view, ...patch };
  for (const w of watchers) w();
};

let socket: WebSocket | undefined;
let ctx: AudioContext | undefined;
let player: PcmPlayer | undefined;
let mic: MicCapture | undefined;
let micUse: "hold" | "call" | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;
let seq = 0;

const nextId = () => {
  seq += 1;
  return `l${seq}`;
};

function audio(): PcmPlayer {
  const context = ctx ?? createAudioContext();
  ctx = context;
  if (!player) {
    player = new PcmPlayer(context);
    player.onIdle = () => {
      if (view.state === "speaking" && !view.onCall) set({ state: "idle" });
    };
  }
  if (context.state === "suspended") void context.resume().catch(() => undefined);
  return player;
}

export function unlockAudio() {
  audio();
}

const send = (o: object) => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(o));
};

function addLine(line: Omit<Line, "id">) {
  set({ lines: [...view.lines, { ...line, id: nextId() }] });
}

function appendLive(text: string) {
  const last = view.lines.at(-1);
  if (last?.from === "reader" && last.live) {
    set({ lines: [...view.lines.slice(0, -1), { ...last, text: last.text + text }] });
  } else addLine({ from: "reader", text, live: true });
}

function settleLive(text: string) {
  const last = view.lines.at(-1);
  if (last?.from === "reader" && last.live) {
    const lines = view.lines.slice(0, -1);
    set({
      lines:
        text || last.text ? [...lines, { ...last, text: text || last.text, live: false }] : lines,
    });
  }
}

function onMessage(m: FromServer) {
  switch (m.type) {
    case "reader":
      set({
        path: m.path,
        index: m.index,
        playing: m.playing,
        ...(m.path !== view.path || m.finished ? { heard: null } : {}),
      });
      break;
    case "sentence":
      if (m.path === view.path) set({ heard: { index: m.index, text: m.text }, index: m.index });
      break;
    case "hush":
      player?.clear();
      break;
    case "note":
      addLine({ from: "reader", text: m.text });
      break;
    case "heard":
      addLine({ from: "person", text: m.text });
      break;
    case "token":
      appendLive(m.text);
      break;
    case "done":
      settleLive(m.text);
      if (!view.onCall && view.state !== "speaking") set({ state: "idle" });
      break;
    case "turn":
      set({ timings: m.timings, model: m.model, turns: view.turns + 1 });
      break;
    case "state":
      if (view.onCall) set({ state: m.state === "idle" ? "listening" : m.state });
      else if (m.state === "speaking") set({ state: "speaking" });
      else if (m.state === "thinking" || m.state === "hearing") set({ state: "busy" });
      else if (view.state !== "recording" && !player?.playing) set({ state: "idle" });
      break;
    case "error":
      set({ error: m.text });
      break;
  }
}

export function connect() {
  if (socket && socket.readyState <= WebSocket.OPEN) return;
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/voice`;
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  socket = ws;
  ws.onopen = () => set({ connected: true, error: null });
  ws.onmessage = (e) => {
    if (e.data instanceof ArrayBuffer) {
      if (ctx) audio().push(new Int16Array(e.data), OUT_RATE);
      return;
    }
    try {
      onMessage(JSON.parse(String(e.data)) as FromServer);
    } catch {
      return;
    }
  };
  ws.onclose = () => {
    if (socket !== ws) return;
    set({ connected: false });
    clearTimeout(retry);
    retry = setTimeout(connect, 2000);
  };
}

export function disconnect() {
  clearTimeout(retry);
  const ws = socket;
  socket = undefined;
  ws?.close();
  closeMic();
}

export function say(text: string) {
  unlockAudio();
  send({ type: "text", text });
}

export function stopSpeaking() {
  player?.clear();
  send({ type: "stop" });
  if (!view.onCall) set({ state: "idle" });
}

export const hush = stopSpeaking;

export function resetLines(lines: Line[]) {
  set({ lines });
}

async function openMicFor(use: "hold" | "call"): Promise<boolean> {
  audio();
  micUse = use;
  if (mic) return true;
  const context = ctx;
  if (!context) return false;
  try {
    const stream = await openMic();
    mic = new MicCapture(
      context,
      stream,
      (pcm) => {
        if (micUse && socket?.readyState === WebSocket.OPEN) socket.send(pcm.buffer);
      },
      MIC_RATE,
    );
    await mic.start();
    set({ error: null });
    return true;
  } catch (e) {
    mic = undefined;
    micUse = null;
    set({ error: micErrorMessage(e), state: "idle" });
    return false;
  }
}

function closeMic() {
  mic?.stop();
  mic = undefined;
  micUse = null;
}

let holding = false;

export async function startRecording() {
  if (view.onCall || holding) return;
  holding = true;
  player?.clear();
  send({ type: "hold", on: true });
  set({ state: "recording" });
  if (!(await openMicFor("hold"))) {
    holding = false;
    send({ type: "hold", on: false });
  }
}

export function stopRecording() {
  if (!holding) return;
  holding = false;
  send({ type: "hold", on: false });
  closeMic();
  set({ state: "busy" });
}

export async function startCall() {
  if (view.onCall) return;
  if (!(await openMicFor("call"))) return;
  send({ type: "call", on: true });
  set({ onCall: true, state: "listening" });
}

export function endCall() {
  send({ type: "call", on: false });
  closeMic();
  set({ onCall: false, state: "idle" });
}

export function useVoice(): VoiceView {
  return useSyncExternalStore(
    (w) => {
      watchers.add(w);
      return () => watchers.delete(w);
    },
    () => view,
  );
}
