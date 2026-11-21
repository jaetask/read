import { IconAction } from "@jaetask/toolkit/suite";
import { useEffect, useRef } from "react";
import type { Doc } from "./api";
import { Icon } from "./icons";
import { renderInline, renderMarkdown } from "./markdown";
import { clearReadAlong, highlightSentence } from "./readAlong";

export type ReaderProps = {
  file: Doc;
  index: number;
  playing: boolean;
  heard: { index: number; text: string } | null;
  onPlay(): void;
  onPause(): void;
  onNext(): void;
  onPrev(): void;
  onGoto(index: number): void;
  onClose(): void;
};

export function Reader({
  file,
  index,
  playing,
  heard,
  onPlay,
  onPause,
  onNext,
  onPrev,
  onGoto,
  onClose,
}: ReaderProps) {
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    body.current?.children[index]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [index]);
  useEffect(() => {
    const el = heard && (body.current?.children[heard.index] as HTMLElement | undefined);
    if (el && heard) highlightSentence(el, heard.text, body.current);
  }, [heard]);
  useEffect(() => clearReadAlong, []);

  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
      aria-label={`Reading ${file.title}`}
    >
      <header className="flex items-center gap-2 border-b border-border px-6 py-3">
        <h1 className="m-0 min-w-0 flex-1 truncate text-sm font-semibold">{file.title}</h1>
        <IconAction label="Previous section" icon={<Icon name="previous" />} onClick={onPrev} />
        {playing ? (
          <IconAction label="Pause" primary icon={<Icon name="pause" />} onClick={onPause} />
        ) : (
          <IconAction label="Read aloud" primary icon={<Icon name="play" />} onClick={onPlay} />
        )}
        <IconAction label="Next section" icon={<Icon name="next" />} onClick={onNext} />
        <IconAction label="Close the file" icon={<Icon name="close" />} onClick={onClose} />
      </header>
      <div
        ref={body}
        className="prose prose-sm min-h-0 max-w-none flex-1 overflow-y-auto px-8 py-5 dark:prose-invert"
      >
        {file.sections.map((s, i) => {
          const H = `h${Math.min(Math.max(s.level, 1), 4)}` as "h1";
          return (
            <section
              key={s.id ?? i}
              data-current={i === index || undefined}
              className={i === index ? "read-current rounded-md px-3" : "px-3"}
            >
              <H
                className="cursor-pointer"
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest("a")) onGoto(i);
                }}
                title="Play from here"
                dangerouslySetInnerHTML={{ __html: renderInline(s.title) }}
              />
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(s.text || "") }} />
            </section>
          );
        })}
      </div>
    </section>
  );
}
