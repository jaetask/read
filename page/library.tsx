import { Link } from "@jaetask/toolkit/suite";
import { Button } from "@jaetask/toolkit/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@jaetask/toolkit/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@jaetask/toolkit/ui/dropdown-menu";
import { Input } from "@jaetask/toolkit/ui/input";
import { type DragEvent, type FormEvent, useState } from "react";
import { call, type Entry } from "./api";
import { Icon } from "./icons";

const DRAG = "application/x-read-entry";
const FILE_ICON: Record<string, string> = {
  markdown: "markdown",
  text: "file-text",
  pdf: "file-type-pdf",
};

export const fileHref = (path: string) =>
  `/file/${path.split("/").map(encodeURIComponent).join("/")}`;

const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const join = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);

function foldersOf(entries: Entry[]): string[] {
  return entries.flatMap((e) => (e.kind === "folder" ? [e.path, ...foldersOf(e.children)] : []));
}

type Ask = { kind: "new-folder"; inside: string } | { kind: "rename"; entry: Entry } | null;

const OPEN_KEY = "read-open-folders";
function loadOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function Library({
  tree,
  current,
  onChanged,
}: {
  tree: Entry[];
  current: string | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(loadOpen);
  const [ask, setAsk] = useState<Ask>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState("");
  const folders = foldersOf(tree);

  const toggle = (path: string) =>
    setOpen((was) => {
      const next = { ...was, [path]: !(was[path] ?? current?.startsWith(`${path}/`) ?? false) };
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify(next));
      } catch {
        return next;
      }
      return next;
    });
  const isOpen = (path: string) => open[path] ?? current?.startsWith(`${path}/`) ?? false;

  const act = async (action: string, input: unknown) => {
    const outcome = await call(action, input);
    setError(
      outcome.state === "succeeded"
        ? ""
        : "reason" in outcome
          ? outcome.reason.message
          : "That did not work.",
    );
    onChanged();
    return outcome.state === "succeeded";
  };
  const move = (from: string, folder: string) => {
    const to = join(folder, nameOf(from));
    if (to !== from) void act("entry-move", { from, to });
  };

  const dropOn = (folder: string) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG)) return;
      e.preventDefault();
      setOver(folder);
    },
    onDragLeave: () => setOver((o) => (o === folder ? null : o)),
    onDrop: (e: DragEvent) => {
      const from = e.dataTransfer.getData(DRAG);
      setOver(null);
      if (!from) return;
      e.preventDefault();
      e.stopPropagation();
      move(from, folder);
    },
  });
  const dragFrom = (path: string) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(DRAG, path);
      e.dataTransfer.effectAllowed = "move";
    },
  });

  const menu = (entry: Entry) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="read-row-menu"
          aria-label={`More for ${entry.kind === "file" ? entry.title : entry.name}`}
        >
          <Icon name="dots" size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => setAsk({ kind: "rename", entry })}>
          <Icon name="pencil" size={16} />
          Rename
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Icon name="folder-symlink" size={16} />
            Move to
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {parentOf(entry.path) && (
              <DropdownMenuItem onSelect={() => move(entry.path, "")}>
                Top of the library
              </DropdownMenuItem>
            )}
            {folders
              .filter(
                (f) =>
                  f !== parentOf(entry.path) && f !== entry.path && !f.startsWith(`${entry.path}/`),
              )
              .map((f) => (
                <DropdownMenuItem key={f} onSelect={() => move(entry.path, f)}>
                  {f}
                </DropdownMenuItem>
              ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {entry.kind === "folder" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setAsk({ kind: "new-folder", inside: entry.path })}>
              <Icon name="folder-plus" size={16} />
              New folder inside
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={entry.children.length > 0}
              onSelect={() => void act("folder-remove", { path: entry.path })}
            >
              <Icon name="trash" size={16} />
              Remove empty folder
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const rows = (entries: Entry[], depth: number) =>
    entries.map((e) =>
      e.kind === "folder" ? (
        <div
          key={e.path}
          className="read-folder"
          data-over={over === e.path || undefined}
          {...dropOn(e.path)}
        >
          <div className="read-row" style={{ paddingLeft: 8 + depth * 14 }} {...dragFrom(e.path)}>
            <Button
              variant="ghost"
              className="read-row-main"
              aria-expanded={isOpen(e.path)}
              onClick={() => toggle(e.path)}
            >
              <Icon name={isOpen(e.path) ? "folder-open" : "folder"} size={16} />
              <span className="read-row-label">{e.name}</span>
            </Button>
            {menu(e)}
          </div>
          {isOpen(e.path) &&
            (e.children.length ? (
              rows(e.children, depth + 1)
            ) : (
              <p className="read-row-empty tk-muted" style={{ paddingLeft: 30 + depth * 14 }}>
                Drag files here
              </p>
            ))}
        </div>
      ) : (
        <div
          key={e.path}
          className="read-row"
          style={{ paddingLeft: 8 + depth * 14 }}
          {...dragFrom(e.path)}
        >
          <Link
            href={fileHref(e.path)}
            className="read-row-main"
            aria-current={e.path === current ? "page" : undefined}
            title={e.title}
          >
            <Icon name={FILE_ICON[e.type] ?? "file"} size={16} />
            <span className="read-row-label">{e.title}</span>
          </Link>
          {menu(e)}
        </div>
      ),
    );

  return (
    <nav className="read-library" aria-label="Library">
      <div className="read-library-head" data-over={over === "" || undefined} {...dropOn("")}>
        <span className="tk-group-label">Files</span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="New folder"
          title="New folder"
          onClick={() => setAsk({ kind: "new-folder", inside: "" })}
        >
          <Icon name="folder-plus" size={16} />
        </Button>
      </div>
      {tree.length ? rows(tree, 0) : <p className="read-row-empty tk-muted">No files yet.</p>}
      {error && (
        <p className="read-error" role="alert">
          {error}
        </p>
      )}
      <NameDialog
        ask={ask}
        onClose={() => setAsk(null)}
        onSave={async (name) => {
          if (!ask) return false;
          if (ask.kind === "new-folder") {
            const ok = await act("folder-create", { path: join(ask.inside, name) });
            if (ok && ask.inside) setOpen((o) => ({ ...o, [ask.inside]: true }));
            return ok;
          }
          return act("entry-move", {
            from: ask.entry.path,
            to: join(parentOf(ask.entry.path), name),
          });
        }}
      />
    </nav>
  );
}

function NameDialog({
  ask,
  onClose,
  onSave,
}: {
  ask: Ask;
  onClose: () => void;
  onSave: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const title = ask?.kind === "rename" ? "Rename" : "New folder";
  const line =
    ask?.kind === "rename"
      ? `The file keeps its place and its conversation.`
      : ask?.inside
        ? `Inside ${ask.inside}.`
        : "At the top of the library.";
  const start = ask?.kind === "rename" ? nameOf(ask.entry.path) : "";
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const ok = await onSave(name.trim());
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Dialog
      open={ask !== null}
      onOpenChange={(o) => {
        if (o) setName(start);
        else onClose();
      }}
    >
      <DialogContent onOpenAutoFocus={() => setName(start)}>
        <form onSubmit={submit} className="read-dialog">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{line}</DialogDescription>
          </DialogHeader>
          <Input
            id="read-name"
            aria-label="Name"
            value={name}
            placeholder={ask?.kind === "rename" ? "orca-deep-dive.md" : "research"}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {ask?.kind === "rename" ? "Rename" : "Make folder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
