import assert from "node:assert/strict";
import { test } from "node:test";
import { CHOICE, findSection, matchFile, parseCommand, parseOpen } from "./commands.js";
import { library } from "./library.js";
import { type Document, type Section, spokenParts, splitSections } from "./sections.js";

const make = (sections: Omit<Section, "order" | "id" | "parent">[]): Document => ({
  path: "t.md",
  title: "T",
  kind: "markdown",
  sections: sections.map((s, i) => ({ ...s, order: i, id: String(i), parent: null })),
});

const fixtures = library(new URL("../../fixtures/files", import.meta.url).pathname);
const open = async (name: string) => {
  const doc = await fixtures.open(`${name}.md`);
  assert.ok(doc, name);
  return doc;
};
const titleAt = (doc: Document, found: { index?: number } | undefined) =>
  found?.index === undefined ? found : doc.sections[found.index]?.title;

test("H1 to H4 start sections, H5 stays in the text, with levels and parents", () => {
  const secs = splitSections(
    "# Title\nIntro text.\n\n## Stack and size\nPython.\n\n### What it is\nAn agent.\n#### Deep part\nDeeper.\n##### Not a section\nStill in.\n",
  );
  assert.deepEqual(
    secs.map((s) => s.title),
    ["Title", "Stack and size", "What it is", "Deep part"],
  );
  assert.ok(secs[3]?.text.includes("Not a section"));
  assert.deepEqual(
    secs.map((s) => s.level),
    [1, 2, 3, 4],
  );
  assert.equal(secs[3]?.parent, "What it is");
  assert.equal(secs[1]?.parent, "Title");
  assert.equal(secs[0]?.parent, null);
});

test("spoken text drops Markdown and the byline under the title", () => {
  assert.deepEqual(spokenParts("**Bold** and `code` and [a link](http://x)"), [
    { text: "Bold and code and a link" },
  ]);
  assert.deepEqual(spokenParts("Nov 8, 2026 · @Tester\n\nFirst line."), [{ text: "First line." }]);
});

const art = make([
  { title: "Hermes", level: 1, text: "Intro." },
  { title: "What it is", level: 2, text: "An agent." },
  { title: "Stack and size", level: 2, text: "Python, big." },
  { title: "Sessions, branching and memory", level: 2, text: "x" },
  { title: "Memory and skills", level: 3, text: "y" },
  { title: "Docker hardening", level: 3, text: "Sandboxing with docker." },
]);
const pc = (t: string) => parseCommand(t, art);

test("reading commands are resolved without a model", () => {
  assert.deepEqual(pc("replay from stack and size"), { cmd: "goto", index: 2 });
  assert.deepEqual(pc("please reread what it is"), { cmd: "goto", index: 1 });
  assert.deepEqual(pc("Can you repeat that, please?"), { cmd: "repeat" });
  assert.deepEqual(pc("go back"), { cmd: "previous" });
  assert.deepEqual(
    ["Stop.", "carry on", "next section", "start from the top", "what sections are there?"].map(
      (t) => pc(t)?.cmd,
    ),
    ["pause", "resume", "next", "top", "list"],
  );
  assert.deepEqual(pc("jump to memory"), { cmd: "ambiguous", options: [4, 3] });
  assert.deepEqual(pc("read the sandboxing section again"), { cmd: "goto", index: 5 });
  assert.equal(pc("what does the egress proxy do?"), undefined);
  assert.equal(pc("how big is it?"), undefined);
});

test("numbered headings are found by their own number", () => {
  const num = make([
    { title: "Intro", level: 1, text: "" },
    { title: "1. The agent loop", level: 2, text: "" },
    { title: "2. Tools", level: 2, text: "" },
    { title: "5. Sessions, branching and memory", level: 2, text: "" },
  ]);
  assert.deepEqual(parseCommand("replay section five", num), { cmd: "goto", index: 3 });
  assert.deepEqual(parseCommand("go to tools", num), { cmd: "goto", index: 2 });
});

test("words run together by speech recognition are split; ordinary words are not", () => {
  const glued = make(
    ["Intro", "How it works", "Worth borrowing", "Gone"].map((title) => ({
      title,
      level: 2,
      text: "",
    })),
  );
  assert.deepEqual(parseCommand("readhow it works", glued), { cmd: "goto", index: 1 });
  assert.deepEqual(parseCommand("jumpto worth borrowing", glued), { cmd: "goto", index: 2 });
  assert.deepEqual(parseCommand("goback", glued), { cmd: "previous" });
  assert.equal(parseCommand("gone", glued), undefined);
  assert.equal(parseCommand("reading", glued), undefined);
});

test("files open by name, list, and stay put when the open file is talked about", async () => {
  const files = fixtures.files();
  assert.deepEqual(
    files.map((f) => f.path),
    [
      "lantern-lessons-for-talk.md",
      "nested-headings.md",
      "numbered-parts.md",
      "plain-parts.md",
      "sample-agent-review.md",
    ],
  );
  assert.equal((await open("sample-agent-review")).sections.length, 9);
  const po = (t: string, current?: string) => parseOpen(t, files, current);
  assert.deepEqual(po("are you able to open the beacon file?"), {
    cmd: "open",
    path: "numbered-parts.md",
    play: false,
  });
  assert.deepEqual(po("switch to the compass notes", "numbered-parts.md"), {
    cmd: "open",
    path: "plain-parts.md",
    play: false,
  });
  assert.deepEqual(po("read the harbor kit deep dive"), {
    cmd: "open",
    path: "nested-headings.md",
    play: true,
  });
  const lantern = po("open lantern");
  assert.equal(lantern?.cmd, "open_ambiguous");
  assert.deepEqual(lantern?.cmd === "open_ambiguous" ? [...lantern.options].sort() : [], [
    "lantern-lessons-for-talk.md",
    "sample-agent-review.md",
  ]);
  assert.deepEqual(po("open the lantern lessons"), {
    cmd: "open",
    path: "lantern-lessons-for-talk.md",
    play: false,
  });
  assert.deepEqual(po("what files are there?"), { cmd: "list_files" });
  assert.equal(po("read the models part", "numbered-parts.md"), undefined);
  assert.equal(po("can you read the what it is section?", "sample-agent-review.md"), undefined);
});

test("speech recognition spellings of file names are matched", () => {
  assert.deepEqual(
    matchFile("open orka", [{ path: "orca-deep-dive.md", title: "Orca: deep dive" }]),
    {
      path: "orca-deep-dive.md",
    },
  );
  assert.deepEqual(
    matchFile("the open bot one", [
      { path: "openbot-deep-dive.md", title: "OpenBot: deep dive" },
      { path: "orca-deep-dive.md", title: "Orca: deep dive" },
    ]),
    { path: "openbot-deep-dive.md" },
  );
});

test("next, resume, numbers and questions in the person's own phrasing", async () => {
  const nump = await open("numbered-parts");
  assert.deepEqual(parseCommand("Enter the next section please.", nump), { cmd: "next" });
  assert.deepEqual(parseCommand("and the next section please", nump), { cmd: "next" });
  assert.equal(parseCommand("what is the next section about?", nump), undefined);
  assert.deepEqual(parseCommand("Okay, read the rest of the section, thanks.", nump), {
    cmd: "resume",
  });
  for (const t of ["read number six", "go to six", "go to the sixth section"])
    assert.equal(titleAt(nump, parseCommand(t, nump) as { index?: number }), "6. Interfaces", t);
  for (const t of [
    "Okay, I'm ready to talk about number six, interfaces. Could you read it to me, please?",
    "tell the reader interface to go to number six and start reading it",
  ])
    assert.equal(titleAt(nump, parseCommand(t, nump) as { index?: number }), "6. Interfaces", t);
  assert.equal(parseCommand("what does section six say about Slack?", nump), undefined);
  assert.equal(parseCommand("explain part two", nump), undefined);
  assert.deepEqual(
    ["6", "six", "Interfaces", "section 6"].map((x) => titleAt(nump, findSection(x, nump))),
    Array(4).fill("6. Interfaces"),
  );
  assert.deepEqual(findSection("99", nump), {});
});

test("without numbered headings, section one is the first part", async () => {
  const plain = await open("plain-parts");
  assert.equal(
    titleAt(plain, parseCommand("read section one", plain) as { index?: number }),
    "Overview",
  );
  assert.equal(
    titleAt(plain, parseCommand("go to the second part", plain) as { index?: number }),
    "Editing",
  );
});

test("an H4 heading is a jump target, and two with one name are told apart by parent", async () => {
  const nest = await open("nested-headings");
  assert.deepEqual(parseCommand("replay from supported systems", nest), { cmd: "goto", index: 3 });
  assert.deepEqual(parseCommand("go to retry rules", nest), { cmd: "goto", index: 8 });
  assert.deepEqual(parseCommand("jump to overview", nest), { cmd: "ambiguous", options: [7, 4] });
  assert.deepEqual(
    [7, 4].map((k) => nest.sections[k]?.parent),
    ["The planner", "Requirements"],
  );
  assert.ok(CHOICE.test("the second one"));
  assert.ok(!CHOICE.test("what does docker do"));
});

test("a title that ends in it, this or that is still a title", () => {
  const doc = make(
    ["Intro", "Stack and size", "Why people like it", "1. The agent loop"].map((title) => ({
      title,
      level: 2,
      text: "",
    })),
  );
  assert.deepEqual(parseCommand("read section why people like it", doc), { cmd: "goto", index: 2 });
  assert.deepEqual(parseCommand("go to why people like it", doc), { cmd: "goto", index: 2 });
  assert.deepEqual(parseCommand("read it again", doc), { cmd: "repeat" });
  assert.deepEqual(parseCommand("read that again", doc), { cmd: "repeat" });
});
