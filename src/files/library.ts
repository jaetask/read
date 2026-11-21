import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { pdfMarkdown } from "./pdf.js";
import { type Document, type FileKind, splitSections } from "./sections.js";

export type Entry =
  | { kind: "folder"; path: string; name: string; children: Entry[] }
  | { kind: "file"; path: string; name: string; title: string; type: FileKind };

const KINDS: Record<string, FileKind> = {
  ".md": "markdown",
  ".markdown": "markdown",
  ".txt": "text",
  ".pdf": "pdf",
};

export const kindOf = (name: string): FileKind | undefined => KINDS[extname(name).toLowerCase()];

const titleFromName = (name: string): string =>
  basename(name, extname(name))
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

export type Library = {
  root: string;
  tree(): Entry[];
  files(): { path: string; title: string }[];
  open(path: string): Promise<Document | undefined>;
  makeFolder(path: string): string;
  move(from: string, to: string): string;
  removeFolder(path: string): void;
};

export class LibraryError extends Error {
  constructor(
    readonly code: "not-found" | "exists" | "outside" | "not-empty" | "bad-name",
    message: string,
  ) {
    super(message);
  }
}

const NAME = /^[^/\\\0]+$/;

export function cleanPath(path: string): string {
  const parts = path
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  if (
    !parts.length ||
    parts.some((p) => p === "." || p === ".." || p.startsWith(".") || !NAME.test(p))
  )
    throw new LibraryError("bad-name", `"${path}" is not a name Read can use.`);
  return parts.join("/");
}

export function library(root: string): Library {
  const cache = new Map<string, { mtime: number; doc: Document }>();

  const inside = (path: string): string | undefined => {
    if (!existsSync(root)) return undefined;
    const base = realpathSync(root);
    const wanted = resolve(base, `.${sep}${path}`);
    if (wanted !== base && !wanted.startsWith(`${base}${sep}`)) return undefined;
    if (!existsSync(wanted)) return undefined;
    const real = realpathSync(wanted);
    return real === base || real.startsWith(`${base}${sep}`) ? real : undefined;
  };

  const base = () => {
    mkdirSync(root, { recursive: true });
    return realpathSync(root);
  };

  const target = (path: string): string => {
    const clean = cleanPath(path);
    const full = resolve(base(), clean);
    if (!full.startsWith(`${base()}${sep}`))
      throw new LibraryError("outside", `"${path}" is outside the library.`);
    return full;
  };

  const markdownTitle = (full: string, name: string): string => {
    if (kindOf(name) !== "markdown") return titleFromName(name);
    const cached = cache.get(full);
    if (cached) return cached.doc.title;
    const h1 = readFileSync(full, "utf8").match(/^#\s+(.+?)\s*#*\s*$/m)?.[1];
    return h1 ?? titleFromName(name);
  };

  const walk = (dir: string): Entry[] => {
    const base = realpathSync(root);
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => !d.name.startsWith("."))
      .flatMap((d): Entry[] => {
        const full = join(dir, d.name);
        const path = relative(base, full).split(sep).join("/");
        if (d.isDirectory()) {
          return [{ kind: "folder", path, name: d.name, children: walk(full) }];
        }
        const type = kindOf(d.name);
        if (!type || !d.isFile()) return [];
        return [{ kind: "file", path, name: d.name, title: markdownTitle(full, d.name), type }];
      })
      .sort(
        (a, b) =>
          Number(b.kind === "folder") - Number(a.kind === "folder") ||
          a.name.localeCompare(b.name, undefined, { numeric: true }),
      );
  };

  const flat = (entries: Entry[]): { path: string; title: string }[] =>
    entries.flatMap((e) =>
      e.kind === "folder" ? flat(e.children) : [{ path: e.path, title: e.title }],
    );

  const tree = () => (existsSync(root) ? walk(realpathSync(root)) : []);

  return {
    root,
    tree,
    files: () => flat(tree()),
    async open(path) {
      const full = inside(path);
      const kind = full ? kindOf(full) : undefined;
      if (!full || !kind || !statSync(full).isFile()) return undefined;
      const mtime = statSync(full).mtimeMs;
      const cached = cache.get(full);
      if (cached?.mtime === mtime) return cached.doc;
      const name = basename(full);
      const fallback = titleFromName(name);
      const text =
        kind === "pdf"
          ? await pdfMarkdown(readFileSync(full), fallback)
          : readFileSync(full, "utf8");
      const sections =
        kind === "text"
          ? splitSections(`# ${fallback}\n\n${text}`)
          : splitSections(text, kind === "pdf" ? fallback : "Introduction");
      const title = sections.find((s) => s.level === 1)?.title ?? fallback;
      const doc: Document = { path, title, kind, sections };
      cache.set(full, { mtime, doc });
      return doc;
    },
    makeFolder(path) {
      const full = target(path);
      if (existsSync(full))
        throw new LibraryError("exists", `Something is already at ${cleanPath(path)}.`);
      mkdirSync(full, { recursive: true });
      return cleanPath(path);
    },
    move(from, to) {
      const source = inside(cleanPath(from));
      if (!source || source === base())
        throw new LibraryError("not-found", `Nothing is at ${from}.`);
      const isFile = statSync(source).isFile();
      let dest = cleanPath(to);
      if (isFile && !kindOf(dest)) dest = `${dest}${extname(source)}`;
      if (isFile && kindOf(dest) !== kindOf(source))
        throw new LibraryError(
          "bad-name",
          `Keep the ${extname(source)} ending: Read reads a file by its ending.`,
        );
      const full = target(dest);
      if (existsSync(full)) throw new LibraryError("exists", `Something is already at ${dest}.`);
      if (!isFile && `${full}${sep}`.startsWith(`${source}${sep}`))
        throw new LibraryError("bad-name", "A folder cannot go inside itself.");
      mkdirSync(dirname(full), { recursive: true });
      renameSync(source, full);
      cache.clear();
      return dest;
    },
    removeFolder(path) {
      const full = inside(cleanPath(path));
      if (!full || full === base() || !statSync(full).isDirectory())
        throw new LibraryError("not-found", `No folder is at ${path}.`);
      if (readdirSync(full).some((n) => !n.startsWith(".")))
        throw new LibraryError(
          "not-empty",
          "The folder still has files in it. Move them out first.",
        );
      rmSync(full, { recursive: true });
    },
  };
}
