export const RATE = 24000;

const loadedContexts = new WeakSet<BaseAudioContext>();

async function ensureWorklet(ctx: AudioContext) {
  if (loadedContexts.has(ctx)) return;
  await ctx.audioWorklet.addModule(new URL("capture-worklet.js", location.href).href);
  loadedContexts.add(ctx);
}

export function createAudioContext(): AudioContext {
  const Ctx: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx({ latencyHint: "interactive" });
  void ctx.resume().catch(() => {});
  return ctx;
}

export function micErrorMessage(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Microphone access was blocked. Allow it in your browser’s site settings.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone found.";
  if (name === "NotReadableError") return "Your microphone is in use by another app.";
  if (!navigator.mediaDevices?.getUserMedia)
    return "This browser can’t use the microphone here (it needs HTTPS or localhost).";
  return (e as Error)?.message || "Could not open the microphone.";
}

export async function openMic(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia)
    throw Object.assign(new Error("no mediaDevices"), { name: "NotSupportedError" });
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  });
}

export class MicCapture {
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;
  level = 0;

  constructor(
    private ctx: AudioContext,
    private stream: MediaStream,
    private onFrame: (pcm: Int16Array) => void,
    private rate = RATE,
  ) {}

  async start() {
    await ensureWorklet(this.ctx);
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "pcm16-capture", {
      processorOptions: { rate: this.rate },
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: "explicit",
    });
    this.node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
      this.level = this.level * 0.6 + e.data.level * 0.4;
      this.onFrame(new Int16Array(e.data.pcm));
    };
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0;
    this.source.connect(this.node).connect(this.sink).connect(this.ctx.destination);
  }

  set muted(m: boolean) {
    for (const t of this.stream.getAudioTracks()) t.enabled = !m;
    if (m) this.level = 0;
  }

  stop() {
    try {
      this.source?.disconnect();
      this.node?.disconnect();
      this.sink?.disconnect();
    } catch {}
    if (this.node) this.node.port.onmessage = null;
    for (const t of this.stream.getTracks()) t.stop();
    this.source = this.node = this.sink = null;
  }
}

export class PcmPlayer {
  private out: GainNode;
  private analyser: AnalyserNode;
  private sources = new Set<AudioBufferSourceNode>();
  private nextTime = 0;
  private idleWaiters: (() => void)[] = [];
  private levelBuf: Float32Array<ArrayBuffer>;
  onIdle: (() => void) | null = null;
  onStart: (() => void) | null = null;

  constructor(private ctx: AudioContext) {
    this.out = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.levelBuf = new Float32Array(this.analyser.fftSize);
    this.out.connect(this.analyser).connect(ctx.destination);
  }

  get playing() {
    return this.sources.size > 0;
  }

  push(pcm: Int16Array, rate = RATE) {
    if (!pcm.length) return;
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    const buf = this.ctx.createBuffer(1, pcm.length, rate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = (pcm[i] ?? 0) / 0x8000;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.out);
    const now = this.ctx.currentTime;
    const wasIdle = !this.sources.size;
    const at = this.nextTime > now ? this.nextTime : now + 0.06;
    src.start(at);
    this.nextTime = at + buf.duration;
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      if (!this.sources.size) this.settle();
    };
    if (wasIdle) this.onStart?.();
  }

  clear() {
    const had = this.sources.size > 0;
    for (const s of this.sources) {
      s.onended = null;
      try {
        s.stop();
      } catch {}
    }
    this.sources.clear();
    this.nextTime = 0;
    if (had) this.settle();
  }

  whenIdle(maxMs = 15000): Promise<void> {
    if (!this.sources.size) return Promise.resolve();
    return new Promise((resolve) => {
      const t = setTimeout(resolve, maxMs);
      this.idleWaiters.push(() => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  level(): number {
    if (!this.sources.size) return 0;
    this.analyser.getFloatTimeDomainData(this.levelBuf);
    let sum = 0;
    for (let i = 0; i < this.levelBuf.length; i++) sum += (this.levelBuf[i] ?? 0) ** 2;
    return Math.min(1, Math.sqrt(sum / this.levelBuf.length) * 4);
  }

  private settle() {
    this.onIdle?.();
    const w = this.idleWaiters.splice(0);
    for (const f of w) f();
  }

  dispose() {
    this.clear();
    try {
      this.out.disconnect();
      this.analyser.disconnect();
    } catch {}
  }
}
