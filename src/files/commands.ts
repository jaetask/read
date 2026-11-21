import type { Document } from "./sections.js";

const STOP_WORDS = new Set(
  "the a an of and to on in it is what that this section part bit about please again from for with its how why where who".split(
    " ",
  ),
);
const ASR_TITLE_FIXES: [string, string][] = [
  ["tusks", "tasks"],
  ["tax", "tasks"],
  ["his", "is"],
  ["stacks", "stack"],
  ["sighs", "size"],
  ["mcb", "mcp"],
  ["m c p", "mcp"],
  ["agent 0", "agent zero"],
  ["agents zero", "agent zero"],
];

function norm(text: string, keepAll = false): string[] {
  let t = ` ${text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ")} `;
  for (const [wrong, right] of ASR_TITLE_FIXES) t = t.replaceAll(` ${wrong} `, ` ${right} `);
  return t.split(/\s+/).filter((w) => w && (keepAll || !STOP_WORDS.has(w)));
}

const stem = (word: string): string => word.slice(0, 5);

const score = (q: Set<string>, t: Set<string>): number => {
  const overlap = [...q].filter((w) => t.has(w)).length;
  if (!overlap) return 0;
  const same = q.size === t.size && overlap === q.size;
  return overlap / q.size + (0.5 * overlap) / t.size + (same ? 1 : 0);
};

const NUMBER_WORDS =
  "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split(
    " ",
  );
const ORDINALS =
  "first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth thirteenth fourteenth fifteenth sixteenth seventeenth eighteenth nineteenth twentieth".split(
    " ",
  );
export const NUMBERED = /^\s*(\d+)[.)]\s/;
const NUM = `(\\d+|${NUMBER_WORDS.join("|")})`;

function asNumber(word: string): number | undefined {
  const w = word.toLowerCase().replace(/^[\s.,!?]+|[\s.,!?]+$/g, "");
  if (/^\d+$/.test(w)) return Number(w);
  if (NUMBER_WORDS.includes(w)) return NUMBER_WORDS.indexOf(w);
  if (ORDINALS.includes(w)) return ORDINALS.indexOf(w) + 1;
  return undefined;
}

function numberIn(query: string): number | undefined {
  const m = query.match(
    new RegExp(`\\b(?:section|part|number|chapter|point|no\\.?)\\s+${NUM}\\b`, "i"),
  );
  if (m?.[1]) return asNumber(m[1]);
  const o = query.match(
    new RegExp(`\\b(${ORDINALS.join("|")})\\s+(?:section|part|chapter|one|bit)\\b`, "i"),
  );
  return o?.[1] ? ORDINALS.indexOf(o[1].toLowerCase()) + 1 : undefined;
}

export function sectionByNumber(doc: Document, n: number): number | undefined {
  const numbered = doc.sections.filter((s) => NUMBERED.test(s.title));
  if (numbered.length) {
    const hit = numbered
      .filter((s) => Number(s.title.match(NUMBERED)?.[1]) === n)
      .sort((a, b) => a.level - b.level)[0];
    return hit?.order;
  }
  const parts = doc.sections.filter((s) => s.level > 1);
  if (!parts.length) return undefined;
  const top = Math.min(...parts.map((s) => s.level));
  return n >= 1 ? parts.filter((s) => s.level === top)[n - 1]?.order : undefined;
}

export type Found = { index?: number; ambiguous?: [number, number] };

export function matchSection(query: string, doc: Document): Found {
  let n = numberIn(query);
  if (n === undefined && query.trim().split(/\s+/).length === 1) n = asNumber(query);
  if (n !== undefined) {
    const k = sectionByNumber(doc, n);
    return k === undefined ? {} : { index: k };
  }
  const strict = new Set(norm(query));
  const all = new Set(norm(query, true));
  if (!all.size) return {};
  const scored: [number, number][] = [];
  for (const s of doc.sections) {
    const title = s.title.replace(NUMBERED, "");
    const tStrict = new Set(norm(title));
    const tAll = new Set(norm(title, true));
    let sc = 0;
    if (strict.size && tStrict.size) sc = score(strict, tStrict);
    else if ([...tAll].every((w) => all.has(w))) sc = score(all, tAll);
    if (sc) scored.push([sc, s.order]);
  }
  if (!scored.length && strict.size) {
    const stems = [...strict].map(stem);
    for (const s of doc.sections) {
      const words = norm(s.text).map(stem);
      const hits = stems.reduce((sum, x) => sum + words.filter((w) => w === x).length, 0);
      if (hits && stems.every((x) => words.includes(x)))
        scored.push([0.5 + Math.min(hits, 10) / 20, s.order]);
    }
  }
  if (!scored.length) return {};
  scored.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const [best, second] = scored as [[number, number], ...[number, number][]];
  if (second && second[0] >= best[0] - 0.15 && second[0] > 0.6) {
    const order = (k: number) => inOrder(query, doc.sections[k]?.title ?? "");
    const [a, b] = [order(best[1]), order(second[1])];
    if (a !== b) return { index: a > b ? best[1] : second[1] };
    return { ambiguous: [best[1], second[1]] };
  }
  return best[0] >= 0.5 ? { index: best[1] } : {};
}

const pairs = (text: string): Set<string> => {
  const words = norm(text.replace(NUMBERED, ""), true);
  return new Set(words.slice(1).map((w, i) => `${words[i]} ${w}`));
};

function inOrder(query: string, title: string): number {
  const q = pairs(query);
  return [...pairs(title)].filter((p) => q.has(p)).length;
}

export function pickChoice(text: string, doc: Document, choices: number[]): number | undefined {
  const scored = choices.map((k) => [inOrder(text, doc.sections[k]?.title ?? ""), k] as const);
  const [first, second] = [...scored].sort((x, y) => y[0] - x[0]);
  return first && first[0] > 0 && (!second || first[0] > second[0]) ? first[1] : undefined;
}

export function findSection(want: string, doc: Document): Found {
  const n = want.trim().split(/\s+/).length === 1 ? asNumber(want) : numberIn(want);
  if (n !== undefined) {
    const k = sectionByNumber(doc, n);
    return k === undefined ? {} : { index: k };
  }
  return matchSection(want, doc);
}

const QUESTION_WORDS = new Set(
  "does do did mean means explain tell me you can could would i we they say says said which when are was were more there be much many".split(
    " ",
  ),
);

export function relevantSections(question: string, doc: Document, k = 2): number[] {
  const qs = new Set(
    norm(question)
      .filter((w) => !QUESTION_WORDS.has(w))
      .map(stem),
  );
  if (!qs.size) return [];
  return doc.sections
    .map((s) => {
      const words = new Set(norm(`${s.title} ${s.text}`).map(stem));
      return [[...qs].filter((w) => words.has(w)).length, s.order] as [number, number];
    })
    .filter(([hits]) => hits > 0)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .slice(0, k)
    .map(([, order]) => order);
}

export type ReadingCommand =
  | { cmd: "pause" | "resume" | "repeat" | "next" | "previous" | "top" | "list" }
  | { cmd: "goto"; index: number }
  | { cmd: "ambiguous"; options: [number, number] };

const COMMANDS: [ReadingCommand["cmd"], RegExp][] = [
  [
    "pause",
    /^\W*(stop|pause|wait|hold on|hang on|one (sec|second|moment)|be quiet)\b[\w\s,.!']{0,20}$/i,
  ],
  [
    "resume",
    /^\W*(continue|resume|carry on|keep going|keep reading|go on|go ahead|play|okay,? (carry on|go on|continue))\b|\b(read|finish|hear) the rest\b|\brest of (the|this|that) (section|part|bit)\b|\bfinish (the|this) (section|part)\b/i,
  ],
  [
    "repeat",
    /\b(repeat (that|this|it|the last (bit|part|section))|say (that|it) again|(can|could) you repeat|read (that|it|this) again|come again|once more|again,? please)\b|^\W*(repeat|again|pardon|sorry\??)\W*$/i,
  ],
  [
    "next",
    /^\W*(?:(?:and|enter|then|okay|ok|now|so|right|um|uh)[,.]?\s+)*(?:the\s+)?(next|skip( it| this| that)?|move on|skip ahead)\b|\b(go to|read|play|on to|onto|move on to|skip to)?\s*the next (section|part|bit|one|chapter)\b/i,
  ],
  [
    "previous",
    /^\W*(?:(?:and|okay|ok|now|so|um|uh)[,.]?\s+)*(previous|back|go back|last (section|part|one)|previous (section|part|one)|the one before)\b|\bthe previous (section|part|bit|one)\b/i,
  ],
  [
    "top",
    /\b(start (again|over|from the (top|beginning))|from the (top|beginning)|start at the beginning|restart)\b/i,
  ],
  [
    "list",
    /\b(what (sections|parts|chapters) (are there|have we got|does it have)|list (the )?(sections|parts)|what'?s in (this|the) (article|file)|table of contents|contents)\b/i,
  ],
];
const GOTO =
  /\b(?:replay|play|read|reread|re-read|go|jump|skip|take me|back|start)\s+(?:back\s+)?(?:from|to|at)?\s*(?:the\s+)?(.+?)(?:\s+(?:section|part|bit))?(?:\s+again)?\W*$/i;
export const QUESTION_FORM =
  /^\W*(what|why|how|when|where|who|which|does|did|do|is|are|was|were|explain|summari[sz]e|tell me (about|what|why|how))\b|\b(say|says|said|mean|means) about\b|\bwhat does\b/i;
const READ_VERB =
  /\b(read|reread|play|replay|go to|jump to|skip to|take me to|start (reading|from|at)|read it)\b/i;
const AND_READ =
  /[\s,]+(and|then)\s+(start\s+)?(reading|read|play(ing)?)(\s+(it|that|this|from there|aloud|out(\s+loud)?|to me|please))*\W*$/i;
const GLUED =
  /\b(reread|re-read|read|replay|jump|go|skip)(?=(?:how|the|to|from|back|what|on)\w*)/gi;
const NOT_A_TITLE =
  /^\W*(back|on|ahead|again|over|next|previous|top|beginning|start|there|one|a bit|please)(\s+(please|again|a bit|one))?\W*$/i;
const PRONOUN = /^\W*(?:(?:all|the rest) of )?(?:that|this|it)(?: (?:one|bit|part|section))?\W*$/i;
const REREAD =
  /\b(?:reread|re-read|read|repeat|replay)\s+(?:the\s+)?(.+?)\s+(?:again|section|part|bit)\W*$/i;

export function parseCommand(text: string, doc: Document | undefined): ReadingCommand | undefined {
  let t = (text ?? "").trim().replace(GLUED, "$1 ");
  if (!t) return undefined;
  if (doc && !QUESTION_FORM.test(t) && READ_VERB.test(t)) {
    const n = numberIn(t);
    if (n !== undefined) {
      const k = sectionByNumber(doc, n);
      if (k !== undefined) return { cmd: "goto", index: k };
    }
  }
  t = t.replace(AND_READ, "");
  if (doc) {
    for (const rx of [REREAD, GOTO]) {
      const target = t.match(rx)?.[1];
      if (!target || PRONOUN.test(target) || NOT_A_TITLE.test(target)) continue;
      const hit = matchSection(target, doc);
      if (hit.index !== undefined) return { cmd: "goto", index: hit.index };
      if (hit.ambiguous) return { cmd: "ambiguous", options: hit.ambiguous };
    }
  }
  const question = QUESTION_FORM.test(t);
  for (const [name, rx] of COMMANDS) {
    if (rx.test(t) && !(question && name !== "list")) return { cmd: name } as ReadingCommand;
  }
  return undefined;
}

export type Named = { path: string; title: string };

const FILE_GENERIC = new Set(
  "deep dive lessons lesson for talk agent file files doc docs document article notes note sample review the a an of and one coding harness pdf md txt".split(
    " ",
  ),
);
const OPEN_VERB =
  /\b(open|load|bring up|pull up|switch to|show me|go to|let'?s read|read|start reading|play)\b/i;
const FILE_WORD = /\b(file|deep ?dive|doc|document|article|notes|pdf)\b/i;
const LIST_FILES =
  /\b(what|which) (files|documents|docs|deep dives)\b|\blist (the |my |all )?(files|documents|docs)\b|\bwhat (else )?can (we|i|you) read\b|\bwhat files\b/i;

const FILE_ASR: [string, string][] = [
  ["orka", "orca"],
  ["open bot", "openbot"],
  ["hermès", "hermes"],
  ["hermez", "hermes"],
  ["deep seek", "deepseek"],
  ["pie", "pi"],
  ["agents zero", "agent zero"],
  ["agent 0", "agent zero"],
];

function fileWords(text: string): string[] {
  let t = ` ${text.toLowerCase().replace(/[^a-z0-9è ]+/g, " ")} `;
  for (const [wrong, right] of FILE_ASR) t = t.replaceAll(` ${wrong} `, ` ${right} `);
  return t.split(/\s+/).filter(Boolean);
}

export function matchFile(query: string, files: Named[]): { path?: string; ambiguous?: string[] } {
  const q = new Set(fileWords(query));
  const scored = files
    .map((f) => {
      const name = new Set(fileWords(`${f.title} ${f.path.replace(/[-/.]/g, " ")}`));
      const hit = [...q].filter((w) => name.has(w) && !FILE_GENERIC.has(w)).length;
      const bonus = ["lessons", "deep", "dive"].filter((w) => q.has(w) && name.has(w)).length * 0.5;
      return [hit ? hit + bonus : 0, f.path] as [number, string];
    })
    .filter(([s]) => s > 0)
    .sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1]));
  const [first, second] = scored;
  if (!first) return {};
  if (second && second[0] === first[0]) return { ambiguous: [first[1], second[1]] };
  return { path: first[1] };
}

export type OpenCommand =
  | { cmd: "list_files" }
  | { cmd: "open"; path: string; play: boolean }
  | { cmd: "open_ambiguous"; options: string[]; play: boolean };

export function parseOpen(text: string, files: Named[], current?: string): OpenCommand | undefined {
  const t = (text ?? "").trim();
  if (!t || !files.length) return undefined;
  if (LIST_FILES.test(t)) return { cmd: "list_files" };
  if (!OPEN_VERB.test(t)) return undefined;
  const hit = matchFile(t, files);
  if (!hit.path && !hit.ambiguous) return undefined;
  const explicit = /\b(open|load|bring up|pull up|switch to)\b/i.test(t) || FILE_WORD.test(t);
  if (hit.path && hit.path === current && !/\b(open|load|switch to)\b/i.test(t)) return undefined;
  if (!explicit) return undefined;
  const play = /\b(read|play|start reading|let'?s read|read it|and read)\b/i.test(t);
  if (hit.ambiguous) return { cmd: "open_ambiguous", options: hit.ambiguous, play };
  return hit.path ? { cmd: "open", path: hit.path, play } : undefined;
}

export const CHOICE = /\b(the )?(first|1st|one|former|second|2nd|two|latter)( one)?\b/i;

export type AppCommand = { cmd: "view"; view: "chat" | "trajectory" } | { cmd: "end_call" };

const TRAJECTORY = /\btrajector(y|ies)\b/i;
const AWAY_FROM_TRAJECTORY = /\b(from|off|close|leave|hide)\b[\w\s]{0,12}\btrajectory\b/i;
const TO_CHAT = /\b(back to|switch to|go to|show|open|change to|return to)\b[\w\s]{0,12}\bchat\b/i;
const END_CALL =
  /\b(hang up|end (the |this )?call|drop (off )?(the |this )?call|drop off|stop (the |this )?call|leave (the |this )?call|finish (the |this )?call|say goodbye|goodbye|bye bye)\b/i;

export function parseApp(text: string): AppCommand | undefined {
  const t = (text ?? "").trim();
  if (!t) return undefined;
  if (END_CALL.test(t)) return { cmd: "end_call" };
  if (TRAJECTORY.test(t) && !AWAY_FROM_TRAJECTORY.test(t)) {
    if (
      /\b(show|open|switch|go|change|see|move|display|put)\b|\btrajectory (view|mode|tab)\b/i.test(
        t,
      )
    )
      return { cmd: "view", view: "trajectory" };
  }
  if (TO_CHAT.test(t) || (AWAY_FROM_TRAJECTORY.test(t) && /\bchat\b/i.test(t)))
    return { cmd: "view", view: "chat" };
  return undefined;
}

export type LibraryCommand =
  | { cmd: "list_folders" }
  | { cmd: "list_folder"; folder: string }
  | { cmd: "make_folder"; name: string };

const LIST_FOLDERS =
  /\b(what|which) folders\b|\blist (the |my |all |our )?folders\b|\bfolders (have we got|do we have|are there|in (the|our|my) library)\b/i;
const IN_FOLDER =
  /\b(?:what(?:'s| is| files are)?|which files are|list(?: the)?(?: files)?|show(?: me)?(?: the files)?)\s+(?:in|inside)\s+(?:the\s+)?(.+?)\s+folder\b/i;
const MAKE_FOLDER =
  /\b(?:make|create|add|new)\s+(?:a\s+)?(?:new\s+)?folder\s+(?:called|named)\s+["“]?(.+?)["”]?\W*$/i;

export function parseLibrary(text: string): LibraryCommand | undefined {
  const t = (text ?? "").trim();
  if (!t) return undefined;
  const make = t.match(MAKE_FOLDER)?.[1];
  if (make) return { cmd: "make_folder", name: make.trim() };
  const inside = t.match(IN_FOLDER)?.[1];
  if (inside) return { cmd: "list_folder", folder: inside.trim() };
  if (LIST_FOLDERS.test(t)) return { cmd: "list_folders" };
  return undefined;
}
