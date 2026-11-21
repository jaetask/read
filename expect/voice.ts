import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { table } from "@jaetask/snap";
import { createRead } from "../src/app.js";
import { readBrain } from "../src/brain.js";

type Script = { open?: string; said: string[] };

export async function runVoice(input: string): Promise<string> {
  const script = JSON.parse(input) as Script;
  const dataDir = mkdtempSync(join(tmpdir(), "read-voice-"));
  const app = await createRead({
    dataDir,
    filesDir: new URL("../fixtures/files", import.meta.url).pathname,
    env: {},
    log: () => undefined,
  });
  try {
    const notes: string[] = [];
    const brain = readBrain({
      reader: app.reader,
      calls: app.calls,
      agent: undefined,
      owner: "owner",
      note: (text) => notes.push(text),
      source: () => "voice",
    });
    if (script.open) await app.reader.open(script.open);
    const rows: string[][] = [];
    for (const said of script.said) {
      notes.length = 0;
      let reply = "";
      app.reader.defer();
      for await (const piece of brain.reply(said, { signal: new AbortController().signal }))
        if (typeof piece === "string") reply += piece;
      await app.reader.release(true);
      const doc = await app.reader.document();
      rows.push([
        said,
        reply || "",
        notes.join(" "),
        doc?.path ?? "",
        doc?.sections[app.reader.state.index]?.title ?? "",
      ]);
    }
    return table(["said", "spoken reply", "shown in the chat", "file", "section"], rows);
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
}
