import { Button } from "@jaetask/toolkit/ui/button";
import { Textarea } from "@jaetask/toolkit/ui/textarea";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { ComposerVoice } from "./composer-voice";
import { AgentAvatar, Icon } from "./icons";
import { renderMarkdown } from "./markdown";
import { Trajectory } from "./trajectory";
import { type Line, say, type VoiceView } from "./voice";

const AGENT = "Read";

const sec = (t: Record<string, number>, k: string) =>
  t[k] != null ? `${(t[k] as number).toFixed(2)}s` : "–";
const timingLine = (t: Record<string, number>) =>
  `heard ${sec(t, "asr")} · first words ${sec(t, "first_token")} · first sentence ${sec(t, "first_sentence")} · speaking after ${sec(t, "first_audio")} · total ${sec(t, "total")}`;

function Message({ line }: { line: Line }) {
  if (line.from === "person")
    return (
      <div className="flex justify-end">
        <p className="m-0 max-w-[85%] rounded-2xl bg-muted px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
          {line.text}
        </p>
      </div>
    );
  return (
    <div
      className="prose prose-sm max-w-none text-sm leading-relaxed dark:prose-invert"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(line.text) }}
    />
  );
}

export function ChatPane({
  voice,
  file,
  problem,
  onDismiss,
}: {
  voice: VoiceView;
  file: string | null;
  problem: string;
  onDismiss: () => void;
}) {
  const [tab, setTab] = useState<"chat" | "trajectory">("chat");
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const size = voice.lines.length + (voice.lines.at(-1)?.text.length ?? 0);
  useEffect(() => {
    if (size) end.current?.scrollIntoView({ block: "end" });
  }, [size]);

  const send = (e?: FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    say(t);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };
  const error = problem || voice.error;

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col" aria-label="Conversation">
      <div className="relative flex h-14 shrink-0 items-center justify-center px-3">
        <span className="flex h-10 items-center gap-2.5 rounded-full bg-muted/60 pr-4 pl-2 text-base font-medium">
          <AgentAvatar name={AGENT} />
          {AGENT}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="absolute right-3 h-9 rounded-full px-4"
          aria-pressed={tab === "trajectory"}
          title={tab === "chat" ? "Show the trajectory" : "Back to the chat"}
          onClick={() => setTab(tab === "chat" ? "trajectory" : "chat")}
        >
          {tab === "chat" ? "Chat" : "Trajectory"}
        </Button>
      </div>
      {tab === "trajectory" ? (
        <Trajectory file={file} turns={voice.turns} />
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-6">
            {voice.lines.length ? (
              <>
                {voice.lines.map((line) => (
                  <Message key={line.id} line={line} />
                ))}
                {voice.lines.at(-1)?.from === "person" && (
                  <p className="m-0 text-sm text-muted-foreground">Thinking</p>
                )}
              </>
            ) : (
              <p className="m-auto max-w-sm text-center text-sm text-muted-foreground">
                {file
                  ? 'Ask about this file, or say "read section two", "read it again", "next", "pause" or "explain it to me".'
                  : 'Open a file on the left, or say "open" and its name.'}
              </p>
            )}
            <div ref={end} />
          </div>
          <form
            className="mx-4 mb-3 rounded-2xl border border-border bg-background p-3"
            onSubmit={send}
          >
            <Textarea
              aria-label={`Message ${AGENT}`}
              value={text}
              rows={3}
              maxLength={4000}
              placeholder={`Message ${AGENT}…`}
              className="min-h-16 resize-none border-0 p-1 shadow-none"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
            />
            <div className="flex items-center justify-end gap-1 pt-1">
              <ComposerVoice state={voice.state} onCall={voice.onCall} reading={voice.playing} />
              <Button
                type="submit"
                size="icon"
                className="size-8 rounded-full"
                aria-label="Send"
                title="Send"
                disabled={!text.trim()}
              >
                <Icon name="arrow-up" />
              </Button>
            </div>
          </form>
        </>
      )}
      {error ? (
        <p className="flex items-center gap-2 px-4 pb-2 text-xs text-destructive" role="alert">
          {error}
          {problem && (
            <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={onDismiss}>
              <Icon name="close" />
            </Button>
          )}
        </p>
      ) : (
        voice.timings &&
        tab === "chat" && (
          <p className="px-4 pb-2 text-center text-[11px] text-muted-foreground">
            {voice.model ? `${voice.model} · ` : ""}
            {timingLine(voice.timings)}
          </p>
        )
      )}
    </main>
  );
}
