import { defineAction, defineDomain, Refusal, type RunContext } from "@jaetask/open-agent-kit";
import { z } from "zod";
import { findSection, matchFile, relevantSections } from "../files/commands.js";
import { type Entry, LibraryError } from "../files/library.js";
import type { Document } from "../files/sections.js";
import type { Turns } from "../chat/turns.js";
import type { Reader } from "./reader.js";

export type ReaderDeps = {
  reader: Reader;
  turns: Turns;
  onMove?: (from: string, to: string) => Promise<void>;
};
type Ctx = RunContext<ReaderDeps>;

const SectionOut = z.object({
  order: z.number(),
  id: z.string(),
  title: z.string(),
  level: z.number(),
  text: z.string(),
  parent: z.string().nullable(),
});
const DocumentOut = z.object({
  path: z.string(),
  title: z.string(),
  kind: z.enum(["markdown", "text", "pdf"]),
  position: z.number(),
  sections: z.array(SectionOut),
});
const EntryOut: z.ZodType<Entry> = z.lazy(() =>
  z.union([
    z.object({
      kind: z.literal("folder"),
      path: z.string(),
      name: z.string(),
      children: z.array(EntryOut),
    }),
    z.object({
      kind: z.literal("file"),
      path: z.string(),
      name: z.string(),
      title: z.string(),
      type: z.enum(["markdown", "text", "pdf"]),
    }),
  ]),
);
const StateOut = z.object({
  file: z.string().nullable(),
  title: z.string().nullable(),
  section: z.string().nullable(),
  index: z.number(),
  reading: z.boolean(),
  sections: z.array(
    z.object({
      number: z.number(),
      title: z.string(),
      level: z.number(),
      under: z.string().nullable(),
    }),
  ),
});
const Moved = z.object({
  file: z.string(),
  section: z.string(),
  index: z.number(),
  reading: z.boolean(),
});

async function openDocument(reader: Reader, path: string): Promise<Document> {
  const doc = await reader.library.open(path);
  if (!doc) throw new Refusal("not-found", `No file is at ${path}. file-list has the files.`);
  return doc;
}

async function current({ reader }: Ctx): Promise<Document> {
  const doc = await reader.document();
  if (!doc) throw new Refusal("no-file", "No file is open. Open one with reader-open first.");
  return doc;
}

const moved = (reader: Reader, doc: Document) => ({
  file: doc.title,
  section: doc.sections[reader.state.index]?.title ?? "",
  index: reader.state.index,
  reading: reader.state.playing,
});

function resolveFile(reader: Reader, file: string): string {
  const files = reader.library.files();
  if (files.some((f) => f.path === file)) return file;
  const hit = matchFile(file, files);
  if (hit.ambiguous) {
    const names = hit.ambiguous.map((p) => files.find((f) => f.path === p)?.title ?? p);
    throw new Refusal(
      "ambiguous",
      `More than one file matches: ${names.join(" or ")}. Ask which one.`,
    );
  }
  if (!hit.path) throw new Refusal("not-found", "No file matches that. file-list has the files.");
  return hit.path;
}

export const fileList = defineAction({
  name: "file-list",
  description: "The folders and files in the library, folders first, each file with its title.",
  effect: "read",
  input: z.object({}),
  output: z.array(EntryOut),
  run: (_input, { reader }: Ctx) => reader.library.tree(),
});

export const fileGet = defineAction({
  name: "file-get",
  description:
    "One file split into sections by its headings (a PDF by its pages), with the section the reading last reached.",
  effect: "read",
  input: z.object({ path: z.string().min(1) }),
  output: DocumentOut,
  run: async ({ path }, { reader }: Ctx) => {
    const doc = await openDocument(reader, path);
    return { ...doc, position: reader.positionOf(path) };
  },
});

export const fileFind = defineAction({
  name: "file-find",
  description:
    "Look something up in a file without moving the reading: the sections that say most about it, with their text. Leave path out for the open file.",
  effect: "read",
  input: z.object({ about: z.string().min(1), path: z.string().optional() }),
  output: z.object({
    file: z.string(),
    found: z.array(z.object({ section: z.string(), text: z.string() })),
  }),
  run: async ({ about, path }, ctx: Ctx) => {
    const doc = path ? await openDocument(ctx.reader, path) : await current(ctx);
    const found = relevantSections(about, doc, 3).map((k) => ({
      section: doc.sections[k]?.title ?? "",
      text: (doc.sections[k]?.text ?? "").slice(0, 2500),
    }));
    return { file: doc.title, found };
  },
});

export const readerState = defineAction({
  name: "reader-state",
  description:
    "The open file: its section titles with level and parent heading, the section the reading is at, and whether it is reading aloud.",
  effect: "read",
  input: z.object({}),
  output: StateOut,
  run: async (_input, { reader }: Ctx) => {
    const doc = await reader.document();
    return {
      file: doc?.path ?? null,
      title: doc?.title ?? null,
      section: doc?.sections[reader.state.index]?.title ?? null,
      index: reader.state.index,
      reading: reader.state.playing,
      sections: (doc?.sections ?? []).map((s) => ({
        number: s.order,
        title: s.title,
        level: s.level,
        under: s.parent,
      })),
    };
  },
});

export const readerOpen = defineAction({
  name: "reader-open",
  description:
    "Open a file in the reader, by its path or a distinctive part of its title. Set play to read it aloud from the top.",
  effect: "write",
  input: z.object({ file: z.string().min(1), play: z.boolean().optional() }),
  output: Moved,
  run: async ({ file, play }, { reader, change }: Ctx) => {
    const path = resolveFile(reader, file);
    const doc = await reader.open(path, play ?? false);
    if (!doc) throw new Refusal("not-found", `No file is at ${path}.`);
    change({ kind: "updated", subject: "reader", id: "reader" });
    return moved(reader, doc);
  },
});

export const readerGoto = defineAction({
  name: "reader-goto",
  description:
    "Move the reader to a section of the open file and read it aloud from there. Section is its number as written in a numbered heading, or its title; index is its place in reader-state's list. Set play false to move without reading.",
  effect: "write",
  input: z
    .object({
      section: z.string().min(1).optional(),
      index: z.number().int().min(0).optional(),
      play: z.boolean().optional(),
    })
    .refine((v) => v.section !== undefined || v.index !== undefined, "Give a section or an index."),
  output: Moved,
  run: async ({ section, index, play }, ctx: Ctx) => {
    const doc = await current(ctx);
    const hit = index !== undefined ? { index } : findSection(section ?? "", doc);
    if (hit.ambiguous) {
      const names = hit.ambiguous.map((k) => {
        const s = doc.sections[k];
        return s?.parent ? `${s.title} under ${s.parent}` : (s?.title ?? "");
      });
      throw new Refusal("ambiguous", `Two sections fit: ${names.join(" or ")}. Ask which one.`);
    }
    if (hit.index === undefined || hit.index >= doc.sections.length)
      throw new Refusal(
        "not-found",
        `No section matches "${section ?? index}". reader-state lists them.`,
      );
    if (play === false) await ctx.reader.move(hit.index);
    else await ctx.reader.read(hit.index, 0);
    ctx.change({ kind: "updated", subject: "reader", id: "reader" });
    return moved(ctx.reader, doc);
  },
});

const step = (name: string, description: string, by: number) =>
  defineAction({
    name,
    description,
    effect: "write",
    input: z.object({}),
    output: Moved,
    run: async (_input, ctx: Ctx) => {
      const doc = await current(ctx);
      const k = ctx.reader.state.index + by;
      if (k < 0 || k >= doc.sections.length)
        throw new Refusal(
          "no-section",
          by > 0 ? "That is the last section." : "That is the start.",
        );
      await ctx.reader.read(k, 0);
      ctx.change({ kind: "updated", subject: "reader", id: "reader" });
      return moved(ctx.reader, doc);
    },
  });

export const readerNext = step(
  "reader-next",
  "Read the section after the one last heard. Use it for 'next section'.",
  1,
);
export const readerPrevious = step(
  "reader-previous",
  "Read the section before the one last heard.",
  -1,
);

export const readerPause = defineAction({
  name: "reader-pause",
  description: "Pause reading aloud. The reader keeps its place.",
  effect: "write",
  input: z.object({}),
  output: Moved,
  run: async (_input, ctx: Ctx) => {
    const doc = await current(ctx);
    await ctx.reader.pause();
    ctx.change({ kind: "updated", subject: "reader", id: "reader" });
    return moved(ctx.reader, doc);
  },
});

export const readerResume = defineAction({
  name: "reader-resume",
  description: "Carry on reading aloud from the sentence where it paused.",
  effect: "write",
  input: z.object({}),
  output: Moved,
  run: async (_input, ctx: Ctx) => {
    const doc = await current(ctx);
    await ctx.reader.resume();
    ctx.change({ kind: "updated", subject: "reader", id: "reader" });
    return moved(ctx.reader, doc);
  },
});

export const readerClose = defineAction({
  name: "reader-close",
  description: "Close the open file. Its place is kept for next time.",
  effect: "write",
  input: z.object({}),
  output: z.object({ closed: z.boolean() }),
  run: async (_input, { reader, change }: Ctx) => {
    await reader.close();
    change({ kind: "updated", subject: "reader", id: "reader" });
    return { closed: true };
  },
});

function library<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    if (error instanceof LibraryError) throw new Refusal(error.code, error.message);
    throw error;
  }
}

export const folderCreate = defineAction({
  name: "folder-create",
  description:
    "Make a folder in the library, such as research or research/agents, to group files in.",
  effect: "write",
  input: z.object({ path: z.string().min(1) }),
  output: z.object({ path: z.string() }),
  run: ({ path }, { reader, change }: Ctx) => {
    const made = library(() => reader.library.makeFolder(path));
    change({ kind: "created", subject: "folder", id: made });
    return { path: made };
  },
});

export const entryMove = defineAction({
  name: "entry-move",
  description:
    "Move or rename a file or folder in the library: from is its path, to is the new path, such as research/orca.md. A file keeps its place and its conversation.",
  effect: "write",
  input: z.object({ from: z.string().min(1), to: z.string().min(1) }),
  output: z.object({ from: z.string(), to: z.string() }),
  run: async ({ from, to }, { reader, turns, onMove, change }: Ctx) => {
    const moved = library(() => reader.library.move(from, to));
    reader.moved(from, moved);
    turns.rename(from, moved);
    await onMove?.(from, moved);
    change({ kind: "updated", subject: "library", id: moved });
    return { from, to: moved };
  },
});

export const folderRemove = defineAction({
  name: "folder-remove",
  description: "Remove an empty folder from the library.",
  effect: "write",
  input: z.object({ path: z.string().min(1) }),
  output: z.object({ removed: z.string() }),
  run: ({ path }, { reader, change }: Ctx) => {
    library(() => reader.library.removeFolder(path));
    change({ kind: "deleted", subject: "folder", id: path });
    return { removed: path };
  },
});

export const viewShow = defineAction({
  name: "view-show",
  description:
    "Switch the conversation pane between the chat and the trajectory, the step-by-step log of each turn with its reader calls and timings.",
  effect: "write",
  input: z.object({ view: z.enum(["chat", "trajectory"]) }),
  output: z.object({ view: z.enum(["chat", "trajectory"]) }),
  run: ({ view }, { reader }: Ctx) => {
    reader.show(view);
    return { view };
  },
});

export const callEnd = defineAction({
  name: "call-end",
  description:
    "End the hands-free voice call, after the reply has been spoken. Use it when the person says goodbye or asks to hang up or drop off the call.",
  effect: "write",
  input: z.object({}),
  output: z.object({ ended: z.boolean() }),
  run: (_input, { reader }: Ctx) => {
    reader.endCall();
    return { ended: true };
  },
});

export const chatTurns = defineAction({
  name: "chat-turns",
  description:
    "The conversation about a file: what was said and the reply, oldest first. Leave file out for the open file.",
  effect: "read",
  input: z.object({ file: z.string().optional() }),
  output: z.array(
    z.object({
      id: z.number(),
      file: z.string(),
      said: z.string(),
      reply: z.string(),
      how: z.enum(["command", "agent"]),
      source: z.enum(["voice", "typed"]),
      at: z.number(),
    }),
  ),
  run: ({ file }, { reader, turns }: Ctx) => turns.list(file ?? reader.state.path ?? ""),
});

const Detail = z
  .object({
    route_how: z.string(),
    model: z.string().nullable(),
    spans: z.array(z.record(z.string(), z.unknown())),
    tool_calls: z.array(z.record(z.string(), z.unknown())),
    timings: z.record(z.string(), z.number()),
    interrupted: z.boolean(),
    error: z.string().nullable(),
  })
  .nullable();

export const chatTimeline = defineAction({
  name: "chat-timeline",
  description:
    "The trajectory of the conversation about a file: for each turn what was said, how it was routed, every reader call with its arguments and result, the reply, and the timings. Leave file out for the open file.",
  effect: "read",
  input: z.object({ file: z.string().optional() }),
  output: z.object({
    session: z.object({ agent_name: z.string(), system_note: z.string() }),
    turns: z.array(
      z.object({
        id: z.number(),
        idx: z.number(),
        source: z.string(),
        user_text: z.string(),
        reply: z.string(),
        at: z.number(),
        detail: Detail,
      }),
    ),
  }),
  run: async ({ file }, { reader, turns }: Ctx) => {
    const path = file ?? reader.state.path ?? "";
    const doc = path ? await reader.library.open(path).catch(() => undefined) : undefined;
    return {
      session: {
        agent_name: "Read",
        system_note: doc
          ? `Reading "${doc.title}" (${doc.sections.length} sections). Reading commands are resolved by Read itself; anything else goes to the model with the file's text.`
          : "No file open.",
      },
      turns: turns.list(path).map((t, i) => ({
        id: t.id,
        idx: i + 1,
        source: t.source,
        user_text: t.said,
        reply: t.reply,
        at: t.at,
        detail: t.detail,
      })),
    };
  },
});

export const readerDomain = defineDomain<ReaderDeps>({
  name: "reader",
  version: "0.1.0",
  about:
    "A library of files read aloud: folders and files (Markdown, plain text and PDF), each split into sections, and one reader that reads the open file aloud sentence by sentence and keeps each file's place.",
  actions: [
    fileList,
    fileGet,
    fileFind,
    folderCreate,
    entryMove,
    folderRemove,
    readerState,
    readerOpen,
    readerGoto,
    readerNext,
    readerPrevious,
    readerPause,
    readerResume,
    readerClose,
    viewShow,
    callEnd,
    chatTurns,
    chatTimeline,
  ],
});
