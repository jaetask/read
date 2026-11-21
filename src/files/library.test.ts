import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { LibraryError, library } from "./library.js";

const fresh = () => {
  const root = mkdtempSync(join(tmpdir(), "read-library-"));
  writeFileSync(join(root, "orca.md"), "# Orca\n\nText.");
  writeFileSync(join(root, "notes.txt"), "Plain.");
  return { root, lib: library(root), done: () => rmSync(root, { recursive: true, force: true }) };
};

test("folders group files: make one, move a file in, rename it, move the folder", () => {
  const { lib, done } = fresh();
  try {
    assert.equal(lib.makeFolder("research"), "research");
    assert.equal(lib.move("orca.md", "research/orca.md"), "research/orca.md");
    assert.equal(lib.move("research/orca.md", "research/orca-notes"), "research/orca-notes.md");
    assert.equal(lib.move("research", "agents/research"), "agents/research");
    assert.deepEqual(
      lib.files().map((f) => f.path),
      ["agents/research/orca-notes.md", "notes.txt"],
    );
  } finally {
    done();
  }
});

test("the library refuses what would lose or misplace a file", () => {
  const { lib, done } = fresh();
  const refused = (work: () => unknown, code: string) =>
    assert.throws(work, (e) => e instanceof LibraryError && e.code === code);
  try {
    lib.makeFolder("a");
    writeFileSync(join(lib.root, "a", "x.md"), "# X");
    refused(() => lib.move("orca.md", "a/x.md"), "exists");
    refused(() => lib.move("orca.md", "../orca.md"), "bad-name");
    refused(() => lib.move("orca.md", "orca.pdf"), "bad-name");
    refused(() => lib.move("a", "a/inner"), "bad-name");
    refused(() => lib.removeFolder("a"), "not-empty");
    refused(() => lib.makeFolder(".hidden"), "bad-name");
    lib.makeFolder("empty");
    lib.removeFolder("empty");
    assert.ok(!lib.tree().some((e) => e.path === "empty"));
  } finally {
    done();
  }
});
