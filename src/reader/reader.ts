import type { DatabaseSync } from "node:sqlite";
import type { Library } from "../files/library.js";
import { type Document, spokenSentences } from "../files/sections.js";
import {
  type Pronunciations,
  Speaker,
  splitSentences,
  spoken,
  type TtsProvider,
} from "../voice/index.js";

export type ReaderEvent =
  | { type: "reader"; path: string | null; index: number; playing: boolean; finished?: boolean }
  | { type: "sentence"; path: string; index: number; sentence: number; text: string }
  | { type: "hush" }
  | { type: "view"; view: "chat" | "trajectory" }
  | { type: "call-end" };

export type Listener = { send(event: ReaderEvent): void };

export type Sound = {
  audio(pcm: Uint8Array): void;
  playing(ms: number): void;
};

export type VoiceSettings = {
  tts: () => TtsProvider;
  voice?: string | undefined;
  speed: number;
  gapMs: number;
  pronunciations: () => Pronunciations;
};

export type ReaderState = {
  path: string | null;
  index: number;
  sentence: number;
  playing: boolean;
};

const READ_AHEAD_MS = 1500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function positions(db: DatabaseSync) {
  db.exec("CREATE TABLE IF NOT EXISTS positions (path TEXT PRIMARY KEY, idx INTEGER NOT NULL)");
  return {
    get: (path: string): number =>
      (
        db.prepare("SELECT idx FROM positions WHERE path = ?").get(path) as
          | { idx: number }
          | undefined
      )?.idx ?? 0,
    set: (path: string, index: number) =>
      void db
        .prepare(
          "INSERT INTO positions (path, idx) VALUES (?, ?) ON CONFLICT(path) DO UPDATE SET idx = excluded.idx",
        )
        .run(path, index),
    rename: (from: string, to: string) =>
      void db
        .prepare(
          "UPDATE positions SET path = ? || substr(path, ?) WHERE path = ? OR substr(path, 1, ?) = ?",
        )
        .run(to, from.length + 1, from, from.length + 1, `${from}/`),
    all: (): Record<string, number> =>
      Object.fromEntries(
        (
          db.prepare("SELECT path, idx FROM positions").all() as { path: string; idx: number }[]
        ).map((r) => [r.path, r.idx]),
      ),
  };
}

export type Positions = ReturnType<typeof positions>;

export class Reader {
  readonly state: ReaderState = { path: null, index: 0, sentence: 0, playing: false };
  private readonly listeners = new Set<Listener>();
  private sound: Sound | undefined;
  private playUntil = 0;
  private reading: { stop: () => Promise<void> } | undefined;
  private store: Positions | undefined;
  private deferred: { index: number; sentence: number } | null | undefined;

  constructor(
    readonly library: Library,
    private readonly voice: VoiceSettings,
  ) {}

  keepPlaces(store: Positions) {
    this.store = store;
  }

  listen(listener: Listener): () => void {
    this.listeners.add(listener);
    listener.send(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  speakThrough(sound: Sound | undefined) {
    this.sound = sound;
  }

  get speaking(): Sound | undefined {
    return this.sound;
  }

  heard(ms: number) {
    this.playUntil = Math.max(this.playUntil, performance.now()) + ms;
  }

  private snapshot(finished?: boolean): ReaderEvent {
    return {
      type: "reader",
      path: this.state.path,
      index: this.state.index,
      playing: this.state.playing,
      ...(finished ? { finished } : {}),
    };
  }

  private emit(event: ReaderEvent) {
    for (const l of this.listeners) l.send(event);
  }

  show(view: "chat" | "trajectory") {
    this.emit({ type: "view", view });
  }

  endCall() {
    this.emit({ type: "call-end" });
  }

  private announce(finished?: boolean) {
    this.emit(this.snapshot(finished));
  }

  async document(): Promise<Document | undefined> {
    return this.state.path ? this.library.open(this.state.path) : undefined;
  }

  positionOf(path: string): number {
    return this.store?.get(path) ?? 0;
  }

  private remember() {
    if (this.state.path) this.store?.set(this.state.path, this.state.index);
  }

  async open(path: string, play = false): Promise<Document | undefined> {
    const doc = await this.library.open(path);
    if (!doc) return undefined;
    await this.stop();
    const saved = Math.min(this.positionOf(path), Math.max(0, doc.sections.length - 1));
    Object.assign(this.state, { path, index: play ? 0 : saved, sentence: 0, playing: false });
    this.announce();
    if (play) await this.read(0, 0);
    return doc;
  }

  moved(from: string, to: string) {
    this.store?.rename(from, to);
    const open = this.state.path;
    if (open && (open === from || open.startsWith(`${from}/`))) {
      this.state.path = to + open.slice(from.length);
      this.announce();
    }
  }

  async close() {
    await this.stop();
    Object.assign(this.state, { path: null, index: 0, sentence: 0, playing: false });
    this.announce();
  }

  async pause() {
    await this.stop();
  }

  async resume() {
    await this.read(this.state.index, this.state.sentence);
  }

  async move(index: number) {
    const doc = await this.document();
    if (!doc) return;
    await this.stop();
    this.state.index = Math.max(0, Math.min(index, doc.sections.length - 1));
    this.state.sentence = 0;
    this.remember();
    this.announce();
  }

  async stop(): Promise<void> {
    await this.reading?.stop();
  }

  defer() {
    this.deferred = null;
  }

  async release(run: boolean) {
    const pending = this.deferred;
    this.deferred = undefined;
    if (run && pending) await this.read(pending.index, pending.sentence);
  }

  async read(index: number, sentence = 0): Promise<void> {
    await this.stop();
    const doc = await this.document();
    if (!doc) return;
    const from = Math.max(0, Math.min(index, doc.sections.length - 1));
    Object.assign(this.state, { index: from, sentence });
    if (this.deferred !== undefined) {
      this.deferred = { index: from, sentence };
      this.remember();
      this.announce();
      return;
    }
    if (!this.sound) {
      this.remember();
      this.announce();
      return;
    }
    this.aloud(doc, from, from === index ? sentence : 0);
  }

  private aloud(doc: Document, index: number, sentence: number) {
    const sound = this.sound;
    if (!sound) return;
    const words = this.voice.pronunciations();
    let stopped = false;
    const heard: { at: number; index: number; sentence: number }[] = [];
    const cues: ReturnType<typeof setTimeout>[] = [];
    const speaker = new Speaker(this.voice.tts(), {
      ...(this.voice.voice ? { voice: this.voice.voice } : {}),
      speed: this.voice.speed,
      gapMs: this.voice.gapMs,
      pronunciations: words,
      onAudio: (pcm) => {
        if (stopped) return;
        this.heard((pcm.byteLength / 2 / speaker.provider.sampleRate) * 1000);
        sound.playing(this.playUntil - performance.now());
        sound.audio(pcm);
      },
    });
    const queued = () => this.playUntil - performance.now();
    let lastCue = 0;
    const afterCues = async () => {
      while (performance.now() < lastCue + 1 && !stopped) await sleep(10);
    };
    let at = { index, sentence };
    const reading: { stop: () => Promise<void> } = { stop: async () => {} };
    this.playUntil = 0;
    this.state.playing = true;
    const done = (async () => {
      for (let i = index; i < doc.sections.length && !stopped; i++) {
        const section = doc.sections[i];
        if (!section) break;
        while (queued() > 300 && !stopped) await sleep(50);
        await afterCues();
        if (stopped) break;
        at = { index: i, sentence: 0 };
        Object.assign(this.state, { index: i, sentence: 0 });
        this.remember();
        this.announce();
        for (const [j, line] of spokenSentences(section, splitSentences).entries()) {
          if (stopped) break;
          if (i === index && j < sentence) continue;
          while (queued() > READ_AHEAD_MS && !stopped) await sleep(50);
          if (stopped) break;
          const starts = Math.max(this.playUntil, performance.now());
          heard.push({ at: starts, index: i, sentence: j });
          lastCue = Math.max(lastCue, starts + 50);
          const text = line.shown ?? spoken(line.say, words);
          cues.push(
            setTimeout(
              () => {
                this.state.sentence = j;
                this.emit({ type: "sentence", path: doc.path, index: i, sentence: j, text });
              },
              Math.max(0, starts - performance.now() + 50),
            ),
          );
          await speaker.say(line.say);
        }
      }
      while (queued() > 0 && !stopped) await sleep(50);
      await afterCues();
      if (!stopped) {
        stopped = true;
        this.state.playing = false;
        this.announce(true);
        if (this.reading === reading) this.reading = undefined;
      }
    })().catch(() => {
      stopped = true;
      this.state.playing = false;
      this.announce();
    });
    reading.stop = async () => {
      if (stopped) return;
      stopped = true;
      speaker.stop();
      this.emit({ type: "hush" });
      for (const c of cues) clearTimeout(c);
      await done;
      const now = heard.filter((h) => h.at <= performance.now()).at(-1) ?? heard[0];
      if (now) at = { index: now.index, sentence: now.sentence };
      this.playUntil = 0;
      sound.playing(0);
      Object.assign(this.state, { ...at, playing: false });
      this.remember();
      this.announce();
      if (this.reading === reading) this.reading = undefined;
    };
    this.reading = reading;
  }
}
