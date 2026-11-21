import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { contract } from "@jaetask/open-agent-kit";
import { snap, table } from "@jaetask/snap";
import { library } from "../src/files/library.js";
import { spokenSentences } from "../src/files/sections.js";
import { readerDomain } from "../src/reader/domain.js";
import { splitSentences } from "../src/voice/index.js";
import { renderContract } from "./render.js";
import { runVoice } from "./voice.js";

const files = library(new URL("../fixtures/files", import.meta.url).pathname);

const failed = await snap([
  {
    dir: "expect/contract",
    render: () => renderContract(contract(readerDomain)),
  },
  {
    dir: "expect/reading",
    render: async (input) => {
      const { file } = JSON.parse(input) as { file: string };
      const doc = await files.open(file);
      if (!doc) throw new Error(`No fixture file ${file}`);
      return [
        `# ${doc.title} (${doc.kind})`,
        table(
          ["#", "section", "level", "under"],
          doc.sections.map((s) => [String(s.order), s.title, String(s.level), s.parent ?? ""]),
        ),
        ...doc.sections.map((s) =>
          [
            `## ${s.order}. ${s.title}`,
            table(
              ["spoken", "highlighted"],
              spokenSentences(s, splitSentences).map((l) => [l.say, l.shown ?? ""]),
            ),
          ].join("\n\n"),
        ),
      ].join("\n\n");
    },
  },
  {
    dir: "expect/page",
    render: (input) => {
      const { folder } = JSON.parse(input) as { folder: string };
      const effects = new Map(readerDomain.actions.map((a) => [a.name, a.effect as string]));
      const scripts = readdirSync(folder)
        .filter((file) => /\.(ts|tsx)$/.test(file))
        .map((file) => readFileSync(join(folder, file), "utf8"))
        .join("\n");
      const called = scripts.matchAll(/\b(?:call|read|act)(?:<[^>]*>)?\("([a-z-]+)"/g);
      const unique = [...new Set([...called].map((m) => m[1] as string))].sort();
      return table(
        ["action the page calls", "effect"],
        unique.map((name) => [`reader.${name}`, effects.get(name) ?? "NOT AN ACTION"]),
      );
    },
  },
  {
    dir: "expect/voice",
    render: runVoice,
  },
]);
process.exit(failed === 0 ? 0 : 1);
