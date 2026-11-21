import { join } from "node:path";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type { Models } from "@earendil-works/pi-ai";
import {
  type Conversation,
  createRegistry,
  defineDoc,
  defineExtension,
  defineTool,
  Harness,
  section,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { contract } from "@jaetask/open-agent-kit";
import type { Calls } from "@jaetask/open-agent-kit";
import { tracing } from "./chat/trace.js";
import { type Document, outline } from "./files/sections.js";
import { readerDomain } from "./reader/domain.js";
import type { Reader } from "./reader/reader.js";

const FILE_IN_FULL = 40_000;

export function fileContext(doc: Document, index: number, reading: boolean): string {
  const { title, sections } = doc;
  const total = sections.reduce((n, s) => n + s.text.length, 0);
  const picks =
    total <= FILE_IN_FULL
      ? sections.map((_, k) => k)
      : [index - 1, index, index + 1].filter((k) => k >= 0 && k < sections.length);
  const body = picks
    .map((k) => `[${sections[k]?.title ?? ""}]\n${sections[k]?.text ?? ""}`)
    .join("\n\n");
  const at = sections[Math.min(index, sections.length - 1)]?.title ?? "";
  return [
    `You and the person are reading the file "${title}" together; the reading is at the section "${at}"${reading ? " and is reading aloud" : ""}.`,
    `"It", "this" and "that" mean the section being read, "${at}", unless the person names something else; explain that section, not the whole file.`,
    "Answer a question about the file in one to three short spoken sentences, using only the file text below. If the file doesn't cover it, say plainly that the file doesn't cover that; don't guess or add outside knowledge.",
    "When asked to explain something more simply, or in another way, do it from the file text.",
    "Don't offer to continue: the person will say carry on when ready.",
    "When asked to read, play, go to, repeat or move on in the file, use the reader tools and say only a few words; never paste or retell the text instead. A question about the file is never a request to read: answer it in words and leave the reader where it is.",
    total > FILE_IN_FULL
      ? "The file is long, so only the sections around the reading are below; reader_state lists them all and file_find looks things up."
      : "",
    `Outline:\n${outline(doc)}`,
    `File text:\n${body}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export type AgentOptions = {
  dataDir: string;
  models: Models;
  model: { provider: string; modelId: string };
  reader: Reader;
  calls: () => Calls;
  owner: string;
};

export type Agent = {
  harness: Harness;
  conversation(key: string): Promise<Conversation>;
  rename(from: string, to: string): Promise<void>;
  close(): Promise<void>;
};

const AGENT_TOOLS = new Set(
  [
    "file-find",
    "reader-state",
    "reader-open",
    "reader-goto",
    "reader-next",
    "reader-previous",
    "reader-pause",
    "reader-resume",
  ].map((name) => `reader.${name}`),
);

const toolName = (action: string) => action.replace(/-/g, "_");

export async function openAgent(options: AgentOptions): Promise<Agent> {
  const { reader } = options;
  const registry = createRegistry();
  const described = contract(readerDomain);
  let seq = 0;
  registry.install(
    defineExtension({
      name: "read",
      sections: [
        section(
          "read",
          async () => {
            const doc = await reader.document();
            const files = reader.library.files();
            const intro =
              "You are the reading companion in Read. You read files aloud with the person and answer questions about them. Replies are spoken, so keep them short and plain, with no Markdown.";
            const list = files.length
              ? `The files (open one with reader_open): ${files.map((f) => f.title).join("; ")}.`
              : "The library has no files yet.";
            if (!doc) return `${intro}\n\n${list}`;
            return `${intro}\n\n${fileContext(doc, reader.state.index, reader.state.playing)}`;
          },
          { tag: false },
        ),
      ],
      tools: described.actions
        .filter((a) => AGENT_TOOLS.has(a.name))
        .map((action) => {
          const { $schema: _, ...parameters } = action.input as { $schema?: unknown };
          return defineTool({
            name: toolName(action.name.split(".").pop() ?? action.name),
            description: action.description,
            parameters,
            execute: async (args: unknown) => {
              seq += 1;
              const invoke = () =>
                options.calls().invoke({
                  id: `agent-${Date.now()}-${seq}`,
                  action: action.name as `${string}.${string}`,
                  input: args ?? {},
                  principal: { id: options.owner },
                  caller: "agent",
                });
              const trace = tracing.current;
              const outcome = trace
                ? await trace.call(action.name, action.effect, args ?? {}, "agent", invoke)
                : await invoke();
              const ok = outcome.state === "succeeded";
              const result = ok
                ? outcome.output
                : { refused: "reason" in outcome ? outcome.reason.message : outcome.state };
              return {
                output: [{ type: "text" as const, text: JSON.stringify(result) }],
                isError: !ok,
              };
            },
          });
        }),
    }),
  );
  const storage = await openNodeSqliteStorage(join(options.dataDir, "agent.db"), { prefix: "pi_" });
  const harness = await Harness.open(storage, { models: options.models, registry }, context);
  harness.resume();
  const known = new Map<string, Promise<Conversation>>();
  return {
    harness,
    conversation(key) {
      const found = known.get(key);
      if (found) return found;
      const made = (async () => {
        const id = await harness.snapshot(Chats, context).then((d) => d?.chats[key]);
        if (id) {
          const existing = await harness.conversation(id as Conversation["id"], context);
          if (existing) return existing;
        }
        const created = await harness.createConversation(
          { ownership: { kind: "ownerless" }, agent: { model: options.model } },
          context,
        );
        await harness.commit(async (tx) => {
          (await tx.doc(Chats)).chats[key] = Number(created.id);
        }, context);
        return (await harness.conversation(created.id, context)) as Conversation;
      })();
      known.set(key, made);
      return made;
    },
    rename: async (from, to) => {
      known.clear();
      await harness.commit(async (tx) => {
        const doc = await tx.doc(Chats);
        for (const key of Object.keys(doc.chats)) {
          if (key !== from && !key.startsWith(`${from}/`)) continue;
          const id = doc.chats[key];
          if (id === undefined) continue;
          delete doc.chats[key];
          doc.chats[to + key.slice(from.length)] = id;
        }
      }, context);
    },
    close: () => harness.close(context),
  };
}

const Chats = defineDoc<{ chats: Record<string, number> }>({
  kind: "read.chats",
  version: 1,
  scope: "session",
  initial: () => ({ chats: {} }),
  checkpointWhen: () => false,
});
