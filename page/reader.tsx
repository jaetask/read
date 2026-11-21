import { MarkdownText } from "@jaetask/toolkit/suite";
import { Button } from "@jaetask/toolkit/ui/button";
import { useEffect, useRef } from "react";
import type { Doc } from "./api";
import { clearReadAlong, highlightSentence } from "./readAlong";

const inline = (text: string) =>
  text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`+([^`]*?)`+/g, "$1")
    .replace(/(\*\*|__|\*|_|~~)(.+?)\1/g, "$2");

export function Reader({
  doc,
  index,
  heard,
  onGoto,
}: {
  doc: Doc;
  index: number;
  heard: { index: number; text: string } | null;
  onGoto: (index: number) => void;
}) {
  const body = useRef<HTMLElement>(null);

  useEffect(() => {
    body.current?.children[index]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [index]);
  useEffect(() => {
    const el = heard && (body.current?.children[heard.index] as HTMLElement | undefined);
    if (el && heard) highlightSentence(el, heard.text, body.current);
  }, [heard]);
  useEffect(() => clearReadAlong, []);

  return (
    <article ref={body} className="read-body" aria-label={`Reading ${doc.title}`}>
      {doc.sections.map((s, i) => {
        const H = `h${Math.min(Math.max(s.level, 1), 4)}` as "h1";
        return (
          <section key={s.id} className="read-section" data-current={i === index || undefined}>
            <H>
              <Button
                variant="link"
                className="read-heading"
                title="Read from here"
                onClick={() => onGoto(i)}
              >
                {inline(s.title)}
              </Button>
            </H>
            {s.text && <MarkdownText content={s.text} />}
          </section>
        );
      })}
    </article>
  );
}
