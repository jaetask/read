import type { Outcome } from "@jaetask/open-agent-kit";

export type Span = {
  kind: string;
  label?: string;
  start: number;
  end: number;
  first?: number | null;
};

export type ToolCall = {
  seq: number;
  name: string;
  kind: string;
  args: unknown;
  outcome: string;
  result: string;
  start_s: number;
  duration_s: number;
  by: "command" | "agent";
};

export type TurnDetail = {
  route_how: string;
  model: string | null;
  spans: Span[];
  tool_calls: ToolCall[];
  timings: Record<string, number>;
  interrupted: boolean;
  error: string | null;
};

const now = () => performance.now();

export class Trace {
  readonly t0 = now();
  said = "";
  reply = "";
  how: "command" | "agent" = "command";
  routeLabel = "";
  routeEnd = 0;
  llm: { start: number; first?: number; end?: number } | undefined;
  readonly tools: ToolCall[] = [];
  error: string | null = null;

  at(): number {
    return (now() - this.t0) / 1000;
  }

  route(label: string) {
    this.routeLabel = label;
    this.routeEnd = this.at();
  }

  async call(
    name: string,
    kind: string,
    args: unknown,
    by: ToolCall["by"],
    run: () => Promise<Outcome>,
  ): Promise<Outcome> {
    const start = this.at();
    const outcome = await run();
    const ok = outcome.state === "succeeded";
    this.tools.push({
      seq: this.tools.length + 1,
      name,
      kind,
      args,
      outcome: ok ? "ok" : outcome.state === "held" ? "held" : "error",
      result: JSON.stringify(ok ? outcome.output : "reason" in outcome ? outcome.reason : outcome),
      start_s: start,
      duration_s: this.at() - start,
      by,
    });
    return outcome;
  }

  detail(
    voice: {
      asr?: number | undefined;
      first_audio?: number | undefined;
      total?: number | undefined;
      first_sentence?: number | undefined;
    },
    model: string | null,
    interrupted: boolean,
  ): TurnDetail {
    const shift = voice.asr ?? 0;
    const spans: Span[] = [];
    if (voice.asr) spans.push({ kind: "asr", start: 0, end: voice.asr });
    spans.push({ kind: "route", label: this.routeLabel, start: shift, end: shift + this.routeEnd });
    if (this.llm)
      spans.push({
        kind: "llm",
        label: model ?? "model",
        start: shift + this.llm.start,
        end: shift + (this.llm.end ?? this.at()),
        first: this.llm.first === undefined ? null : shift + this.llm.first,
      });
    if (voice.first_audio !== undefined)
      spans.push({ kind: "tts", start: voice.first_audio, end: voice.total ?? voice.first_audio });
    const total = voice.total ?? shift + this.at();
    return {
      route_how: this.how === "agent" ? "agent" : "command",
      model: this.how === "agent" ? model : null,
      spans,
      tool_calls: this.tools.map((c) => ({ ...c, start_s: shift + c.start_s })),
      timings: {
        ...(voice.asr === undefined ? {} : { asr: voice.asr }),
        ...(this.llm?.first === undefined ? {} : { first_token: shift + this.llm.first }),
        ...(voice.first_sentence === undefined ? {} : { first_sentence: voice.first_sentence }),
        ...(voice.first_audio === undefined ? {} : { first_audio: voice.first_audio }),
        total,
      },
      interrupted,
      error: this.error,
    };
  }
}

let current: Trace | undefined;

export const tracing = {
  start(trace: Trace) {
    current = trace;
  },
  stop(trace: Trace) {
    if (current === trace) current = undefined;
  },
  get current(): Trace | undefined {
    return current;
  },
};
