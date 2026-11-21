import type { Calls, Outcome } from "@jaetask/open-agent-kit";
import type { Agent } from "./agent.js";
import type { Turns } from "./chat/turns.js";
import {
  CHOICE,
  NUMBERED,
  parseCommand,
  parseOpen,
  type ReadingCommand,
} from "./files/commands.js";
import type { Document } from "./files/sections.js";
import type { Reader } from "./reader/reader.js";
import { type Brain, durableBrain } from "./voice/index.js";

export type Note = (text: string) => void;

export type ReadBrainOptions = {
  reader: Reader;
  calls: Calls;
  agent: Agent | undefined;
  turns: Turns;
  owner: string;
  note: Note;
  source: () => "voice" | "typed";
};

const plain = (title: string) => title.replace(NUMBERED, "");

export function readBrain(options: ReadBrainOptions): Brain & { choices: number[] | undefined } {
  const { reader } = options;
  let seq = 0;
  let fileChoices: { options: string[]; play: boolean } | undefined;
  const state = { choices: undefined as number[] | undefined };

  const call = (action: string, input: unknown = {}): Promise<Outcome> => {
    seq += 1;
    return options.calls.invoke({
      id: `voice-${Date.now()}-${seq}`,
      action: `reader.${action}`,
      input,
      principal: { id: options.owner },
      caller: "ui",
    });
  };

  const record = (said: string, reply: string, how: "command" | "agent") =>
    options.turns.add({
      file: reader.state.path ?? "",
      said,
      reply,
      how,
      source: options.source(),
    });

  function listParts(doc: Document): string {
    const top = doc.sections
      .filter((s) => s.level <= 2)
      .slice(1)
      .map((s) => plain(s.title));
    const heads = top.length ? top : doc.sections.map((s) => plain(s.title));
    if (heads.length > 8)
      return `There are ${heads.length} main parts, starting with ${heads.slice(0, 4).join(", ")}, and ${heads[4]}.`;
    if (heads.length > 1)
      return `There are ${heads.length} parts: ${heads.slice(0, -1).join(", ")}, and ${heads.at(-1)}.`;
    return `Just one part: ${heads[0] ?? doc.title}.`;
  }

  async function command(
    doc: Document,
    cmd: ReadingCommand,
  ): Promise<{ say: string; start?: number }> {
    const i = reader.state.index;
    const last = doc.sections.length - 1;
    if (cmd.cmd !== "ambiguous") state.choices = undefined;
    switch (cmd.cmd) {
      case "pause":
        await call("reader-pause");
        return { say: "Okay." };
      case "resume":
        await call("reader-resume");
        return { say: "", start: i };
      case "repeat":
        return { say: "", start: i };
      case "next":
        return i < last ? { say: "", start: i + 1 } : { say: "That's the last section." };
      case "previous":
        return i > 0 ? { say: "", start: i - 1 } : { say: "That's the start.", start: 0 };
      case "top":
        return { say: "", start: 0 };
      case "goto":
        return { say: "", start: cmd.index };
      case "list":
        return { say: listParts(doc) };
      case "ambiguous": {
        state.choices = cmd.options;
        const [x, y] = cmd.options.map((k) => doc.sections[k]);
        let [a, b] = [plain(x?.title ?? ""), plain(y?.title ?? "")];
        if (a === b) {
          a = `${a} under ${plain(x?.parent ?? "the start")}`;
          b = `${b} under ${plain(y?.parent ?? "the start")}`;
        }
        return { say: `Did you mean ${a}, or ${b}?` };
      }
    }
  }

  async function* deterministic(text: string): AsyncGenerator<string, boolean> {
    const files = reader.library.files();
    const doc = await reader.document();
    const titles = new Map(files.map((f) => [f.path, f.title]));
    if (fileChoices && CHOICE.test(text)) {
      const second = /\b(second|2nd|two|latter)\b/i.test(text);
      const path = fileChoices.options[second ? 1 : 0];
      const play = fileChoices.play;
      fileChoices = undefined;
      if (path) {
        options.note(`Opening “${titles.get(path) ?? path}”.`);
        await call("reader-open", { file: path, play });
        record(text, `Opening “${titles.get(path) ?? path}”.`, "command");
        return true;
      }
    }
    const open = parseOpen(text, files, doc?.path);
    if (open) {
      let say = "";
      if (open.cmd === "list_files") {
        const names = files.map((f) => f.title);
        say =
          names.length > 1
            ? `There are ${names.length} files: ${names.slice(0, -1).join(", ")}, and ${names.at(-1)}.`
            : names.length
              ? `There's one file: ${names[0]}.`
              : "There are no files yet.";
      } else if (open.cmd === "open_ambiguous") {
        fileChoices = { options: open.options, play: open.play };
        say = `Did you mean ${open.options.map((p) => titles.get(p) ?? p).join(", or ")}?`;
      } else {
        fileChoices = undefined;
        const note = `Opening “${titles.get(open.path) ?? open.path}”.`;
        options.note(note);
        await call("reader-open", { file: open.path, play: open.play });
        record(text, note, "command");
        return true;
      }
      record(text, say, "command");
      yield say;
      return true;
    }
    if (!doc) return false;
    if (state.choices && CHOICE.test(text)) {
      const second = /\b(second|2nd|two|latter)\b/i.test(text);
      const k = state.choices[second ? 1 : 0];
      state.choices = undefined;
      if (k !== undefined) {
        const note = `Reading “${plain(doc.sections[k]?.title ?? "")}”.`;
        options.note(note);
        await call("reader-goto", { index: k, play: true });
        record(text, note, "command");
        return true;
      }
    }
    const cmd = parseCommand(text, doc);
    if (!cmd) return false;
    const { say, start } = await command(doc, cmd);
    if (start !== undefined && cmd.cmd !== "resume") {
      await call("reader-goto", { index: start, play: true });
    }
    const note =
      say || (start !== undefined ? `Reading “${plain(doc.sections[start]?.title ?? "")}”.` : "");
    if (!say && note) options.note(note);
    record(text, note, "command");
    if (say) yield say;
    return true;
  }

  return {
    get choices() {
      return state.choices;
    },
    async *reply(text, { signal }) {
      const handled = yield* deterministic(text);
      if (handled) return;
      if (!options.agent) {
        const say = "No model is set up, so I can only follow reading commands.";
        record(text, say, "agent");
        yield say;
        return;
      }
      const conversation = await options.agent.conversation(reader.state.path ?? "");
      let reply = "";
      for await (const piece of durableBrain(options.agent.harness, conversation).reply(text, {
        signal,
      })) {
        if (typeof piece === "string") reply += piece;
        yield piece;
      }
      record(text, reply.trim(), "agent");
    },
  };
}
