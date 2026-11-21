import { useSyncExternalStore } from "react";
import { createAudioContext, MicCapture, micErrorMessage, openMic, PcmPlayer } from "./audio";

export type Line = { id: string; from: "person" | "reader"; text: string; live?: boolean };

export type VoiceView = {
  connected: boolean;
  path: string | null;
  index: number;
  playing: boolean;
  heard: { index: number; text: string } | null;
  listening: boolean;
  state: "listening" | "hearing" | "thinking" | "speaking" | "idle";
  lines: Line[];
  error: string | null;
};

type FromServer =
  | { type: "reader"; path: string | null; index: number; playing: boolean; finished?: boolean }
  | { type: "sentence"; path: string; index: number; sentence: number; text: string }
  | { type: "hush" }
  | { type: "note"; text: string }
  | { type: "heard"; text: string }
  | { type: "token"; text: string }
  | { type: "done"; text: string; interrupted: boolean }
  | { type: "state"; state: VoiceView["state"] }
  | { type: "error"; text: string };

const MIC_RATE = 16000;
const OUT_RATE = 24000;

let view: VoiceView = {
  connected: false,
  path: null,
  index: 0,
  playing: false,
  heard: null,
  listening: false,
  state: "idle",
  lines: [],
  error: null,
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
let retry: ReturnType<typeof setTimeout> | undefined;
let seq = 0;

const nextId = () => {
  seq += 1;
  return `l${seq}`;
};

function audio(): PcmPlayer {
  const context = ctx ?? createAudioContext();
  ctx = context;
  player ??= new PcmPlayer(context);
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
        ...(m.path !== view.path ? { heard: null } : {}),
      });
      break;
    case "sentence":
      if (m.path === view.path) set({ heard: { index: m.index, text: m.text } });
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
      break;
    case "state":
      set({ state: m.state });
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
  stopListening();
}

export function say(text: string) {
  unlockAudio();
  send({ type: "text", text });
}

export function hush() {
  player?.clear();
  send({ type: "stop" });
}

export function resetLines(lines: Line[]) {
  set({ lines });
}

export async function startListening() {
  const out = audio();
  if (mic || !ctx) return;
  try {
    const stream = await openMic();
    mic = new MicCapture(
      ctx,
      stream,
      (pcm) => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(pcm.buffer);
      },
      MIC_RATE,
    );
    await mic.start();
    send({ type: "mic", on: true });
    set({ listening: true, error: null });
    void out;
  } catch (e) {
    mic = undefined;
    set({ listening: false, error: micErrorMessage(e) });
  }
}

export function stopListening() {
  mic?.stop();
  mic = undefined;
  send({ type: "mic", on: false });
  set({ listening: false });
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
