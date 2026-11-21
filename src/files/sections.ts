export type Section = {
  title: string;
  level: number;
  text: string;
  order: number;
  id: string;
  parent: string | null;
};

export type Document = { path: string; title: string; kind: FileKind; sections: Section[] };

export type FileKind = "markdown" | "text" | "pdf";

const HEADING = /^(#{1,4})\s+(.+?)\s*#*\s*$/;

export const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "section";

export function splitSections(markdown: string, untitled = "Introduction"): Section[] {
  const raw: { title: string | null; level: number; text: string }[] = [];
  let title: string | null = null;
  let level = 1;
  let buf: string[] = [];
  const flush = () => {
    const body = buf.join("\n").trim();
    if (title !== null || body) raw.push({ title, level, text: body });
  };
  for (const line of markdown.split("\n")) {
    const m = line.match(HEADING);
    if (m?.[1] && m[2]) {
      flush();
      title = m[2].trim();
      level = m[1].length;
      buf = [];
    } else buf.push(line);
  }
  flush();
  const stack: Section[] = [];
  return raw.map((s, i) => {
    const name = s.title ?? untitled;
    const section: Section = {
      title: name,
      level: s.level,
      text: s.text,
      order: i,
      id: `${String(i).padStart(2, "0")}-${slug(name)}`,
      parent: null,
    };
    while (stack.length && (stack.at(-1)?.level ?? 0) >= section.level) stack.pop();
    section.parent = stack.at(-1)?.title ?? null;
    stack.push(section);
    return section;
  });
}

const BYLINE = /^\s*[A-Z][a-z]{2,8}\.? \d{1,2}, \d{4}\s*·\s*@\w+\s*$/gm;

function cleanProse(body: string): string {
  return body
    .replace(BYLINE, "")
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]+)\]\((?:[^()\s]|\([^()\s]*\))*\)/g, "$1")
    .replace(/(\*\*|__|\*|_|~~)(.+?)\1/g, "$2")
    .replace(/^\s*([-*+•]|\d+[.)])\s+/gm, "")
    .replace(/^\s*(#{1,6}|>)\s*/gm, "")
    .replace(/^\s*([-*_])(\s*\1){2,}\s*$/gm, "")
    .replace(/\n{2,}/g, "\n\n")
    .trim();
}

const TABLE_DELIM = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const FENCE = /^\s{0,3}(```|~~~)/;

export function tableCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const out: string[] = [];
  let cur = "";
  let tick = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
      continue;
    }
    if (s[i] === "`") tick = !tick;
    if (s[i] === "|" && !tick) {
      out.push(cur.trim());
      cur = "";
    } else cur += s[i];
  }
  out.push(cur.trim());
  return out;
}

function isTableStart(lines: string[], i: number): boolean {
  const head = lines[i] ?? "";
  const next = lines[i + 1];
  if (!head.includes("|") || next === undefined || !next.includes("-") || !TABLE_DELIM.test(next))
    return false;
  return next.includes("|") || tableCells(head).length === 1;
}

export const plainInline = (text: string): string =>
  text
    .replace(/!?\[([^\]]*)\]\((?:[^()\s]|\([^()\s]*\))+\)/g, "$1")
    .replace(/`+([^`]*?)`+/g, "$1")
    .replace(/(\*\*|__|~~)(.+?)\1/g, "$2")
    .replace(/(?<![\w*])\*(\S(?:.*?\S)?)\*(?!\*)/g, "$1")
    .replace(/(?<!\w)_(\S(?:.*?\S)?)_(?!\w)/g, "$1")
    .replace(/\\([\\`*_{}[\]()#+\-.!|~>])/g, "$1")
    .trim();

export function rowSentence(header: string[], row: string[]): { say: string; shown: string } {
  const head = header.map((h) =>
    plainInline(h)
      .replace(/[?:]+$/, "")
      .trim(),
  );
  const cells = head.map((_, i) => plainInline(row[i] ?? ""));
  const word = (t: string) =>
    t
      .replace(/[_|]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.;:,]+$/, "");
  const first = cells[0] ? word(cells[0]) : "";
  const rest = head.slice(1).map((h, i) => {
    const value = cells[i + 1] ?? "";
    if (!value || !/\w/.test(value)) return "";
    return h ? `${word(h)}: ${word(value)}` : word(value);
  });
  const parts = [first, ...rest].filter(Boolean);
  return {
    say: parts.length ? `${parts.join(". ")}.` : "",
    shown: cells.filter(Boolean).join(" "),
  };
}

export type Part = { text: string; shown?: string };

export function spokenParts(body: string): Part[] {
  const lines = body.split("\n");
  const out: Part[] = [];
  let prose: string[] = [];
  let fenced = false;
  const flush = () => {
    const text = cleanProse(prose.join("\n"));
    if (text) out.push({ text });
    prose = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (FENCE.test(line)) fenced = !fenced;
    else if (!fenced && isTableStart(lines, i)) {
      flush();
      const header = tableCells(line);
      i += 2;
      for (; i < lines.length && lines[i]?.trim() && lines[i]?.includes("|"); i++) {
        const { say, shown } = rowSentence(header, tableCells(lines[i] ?? ""));
        if (say) out.push({ text: say, shown });
      }
      i--;
      continue;
    }
    prose.push(line);
  }
  flush();
  return out;
}

export type Line = { say: string; shown?: string };

export function spokenSentences(section: Section, split: (text: string) => string[]): Line[] {
  const out: Line[] = split(`${section.title.replace(/[.:]+$/, "")}.`).map((say) => ({ say }));
  for (const part of spokenParts(section.text)) {
    if (part.shown === undefined) out.push(...split(part.text).map((say) => ({ say })));
    else out.push({ say: part.text, shown: part.shown });
  }
  return out;
}

export function speakTableLines(text: string): string {
  return text
    .replace(/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/gm, "")
    .replace(/^[ \t]*\|.*\|[ \t]*$/gm, (row) => {
      const cells = tableCells(row)
        .map((c) => plainInline(c).replace(/[_|]/g, " ").replace(/\s+/g, " ").trim())
        .filter((c) => /\w/.test(c))
        .map((c) => c.replace(/[.;:,?! ]+$/, ""));
      return cells.length ? `${cells.join(", ")}.` : "";
    });
}

export const outline = (doc: Document): string =>
  doc.sections.map((s) => `${"  ".repeat(Math.max(0, s.level - 1))}${s.title}`).join("\n");
