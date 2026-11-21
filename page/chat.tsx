import { Button } from "@jaetask/toolkit/ui/button";
import { Textarea } from "@jaetask/toolkit/ui/textarea";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { type Line, say, startListening, stopListening, type VoiceView } from "./voice";

const STATE_LINE: Record<VoiceView["state"], string> = {
  idle: "",
  listening: "Listening",
  hearing: "Hearing you",
  thinking: "Thinking",
  speaking: "Speaking",
};

export function Chat({ voice, title }: { voice: VoiceView; title: string | null }) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const count = voice.lines.length + (voice.lines.at(-1)?.text.length ?? 0);
  useEffect(() => {
    if (count) end.current?.scrollIntoView({ block: "end" });
  }, [count]);

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

  return (
    <aside className="read-chat" aria-label="Conversation">
      <div className="read-lines">
        {voice.lines.length ? (
          voice.lines.map((line: Line) => (
            <p key={line.id} className="read-line" data-from={line.from}>
              {line.text}
            </p>
          ))
        ) : (
          <p className="read-hint tk-muted">
            {title
              ? `Ask about ${title}, or say "read section two", "next", "pause" or "explain that more simply".`
              : 'Open a file, or say "open" and its name.'}
          </p>
        )}
        <div ref={end} />
      </div>
      {voice.error && (
        <p className="read-error" role="alert">
          {voice.error}
        </p>
      )}
      <form className="read-composer" onSubmit={send}>
        <Textarea
          aria-label="Message"
          value={text}
          rows={2}
          maxLength={2000}
          placeholder={title ? `Ask about ${title}` : "Ask or give a command"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="read-composer-bar">
          <span className="read-state tk-muted">
            {voice.listening ? STATE_LINE[voice.state] : ""}
          </span>
          <Button
            type="button"
            variant={voice.listening ? "default" : "ghost"}
            size="icon"
            aria-label={voice.listening ? "Stop listening" : "Talk hands-free"}
            aria-pressed={voice.listening}
            title={voice.listening ? "Stop listening" : "Talk hands-free"}
            onClick={() => (voice.listening ? stopListening() : void startListening())}
          >
            <Icon name={voice.listening ? "microphone" : "microphone-off"} />
          </Button>
          <Button type="submit" size="icon" aria-label="Send" title="Send" disabled={!text.trim()}>
            <Icon name="arrow-up" />
          </Button>
        </div>
      </form>
    </aside>
  );
}
