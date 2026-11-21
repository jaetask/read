import { wavBytes } from "./audio.js";

export type TranscribeOptions = {
  prompt?: string | undefined;
  language?: string | undefined;
  signal?: AbortSignal | undefined;
};

export interface SttProvider {
  readonly name: string;
  transcribe(pcm: Uint8Array, rate: number, options?: TranscribeOptions): Promise<string>;
}

export type WhisperOptions = {
  baseUrl?: string | undefined;
  model?: string | undefined;
  apiKey?: string | undefined;
  fetch?: typeof fetch;
};

export function whisper(options: WhisperOptions = {}): SttProvider {
  return {
    name: "whisper",
    async transcribe(pcm, rate, opts = {}) {
      const form = new FormData();
      form.append(
        "file",
        new Blob([wavBytes(pcm, rate) as Uint8Array<ArrayBuffer>], { type: "audio/wav" }),
        "speech.wav",
      );
      form.append("model", options.model ?? "whisper-1");
      form.append("response_format", "json");
      form.append("language", opts.language ?? "en");
      if (opts.prompt) form.append("prompt", opts.prompt);
      const res = await (options.fetch ?? fetch)(
        `${(options.baseUrl ?? "http://127.0.0.1:3900").replace(/\/$/, "")}/v1/audio/transcriptions`,
        {
          method: "POST",
          headers: options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {},
          body: form,
          signal: opts.signal ?? null,
        },
      );
      if (!res.ok)
        throw new Error(
          `whisper answered ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`,
        );
      return String(((await res.json()) as { text?: string | undefined }).text ?? "").trim();
    },
  };
}
