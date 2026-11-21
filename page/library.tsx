import {
  Field,
  FormDialog,
  InlineText,
  Link,
  type MenuEntry,
  RowMenu,
} from "@jaetask/toolkit/suite";
import { Button } from "@jaetask/toolkit/ui/button";
import { Input } from "@jaetask/toolkit/ui/input";
import { IconChevronRight } from "@tabler/icons-react";
import { type DragEvent, useState } from "react";
import { call, type Entry } from "./api";
import { Icon, type IconName } from "./icons";

const DRAG = "application/x-read-entry";
const FILE_ICON: Record<string, IconName> = { markdown: "markdown", text: "text", pdf: "pdf" };
const OPEN_KEY = "read:open-folders";

export const fileHref = (path: string) =>
  `/file/${path.split("/").map(encodeURIComponent).join("/")}`;

const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const join = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);
const foldersOf = (entries: Entry[]): string[] =>
  entries.flatMap((e) => (e.kind === "folder" ? [e.path, ...foldersOf(e.children)] : []));

function remembered(): Record<string, boolean> {
  try {
    const saved = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "{}");
    return saved && typeof saved === "object" ? (saved as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

const ROW =
  "group flex min-w-0 items-center gap-1 rounded-md pr-1 text-sm hover:bg-sidebar-accent data-[over=true]:bg-sidebar-accent";
const MAIN =
  "flex min-w-0 flex-1 items-center gap-2 py-1.5 text-sidebar-foreground aria-[current=page]:font-semibold";

export function Library({
  tree,
  current,
  onChanged,
  onError,
}: {
  tree: Entry[];
  current: string | null;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(remembered);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newIn, setNewIn] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const folders = foldersOf(tree);

  const isOpen = (path: string) => open[path] ?? current?.startsWith(`${path}/`) ?? false;
  const setFolder = (path: string, value: boolean) =>
    setOpen((was) => {
      const next = { ...was, [path]: value };
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify(next));
      } catch {
        return next;
      }
      return next;
    });

  const act = async (action: string, input: unknown) => {
    const outcome = await call(action, input);
    if (outcome.state !== "succeeded")
      onError("reason" in outcome ? outcome.reason.message : "That did not work.");
    onChanged();
    return outcome.state === "succeeded";
  };
  const move = (from: string, folder: string) => {
    const to = join(folder, nameOf(from));
    if (to !== from) void act("entry-move", { from, to });
  };
  const rename = (entry: Entry, name: string) =>
    void act("entry-move", { from: entry.path, to: join(parentOf(entry.path), name) });

  const dropOn = (folder: string) => ({
    "data-over": over === folder ? "true" : undefined,
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

  const items = (entry: Entry): MenuEntry[] => {
    const targets = folders.filter(
      (f) => f !== parentOf(entry.path) && f !== entry.path && !f.startsWith(`${entry.path}/`),
    );
    const moveTo: MenuEntry[] = [
      ...(parentOf(entry.path)
        ? [{ label: "Top of the library", onSelect: () => move(entry.path, "") }]
        : []),
      ...targets.map((f) => ({ label: f, onSelect: () => move(entry.path, f) })),
    ];
    const folderItems: MenuEntry[] =
      entry.kind === "folder"
        ? [
            "line",
            {
              label: "New folder inside",
              icon: <Icon name="folder-plus" />,
              onSelect: () => setNewIn(entry.path),
            },
            {
              label: "Remove folder",
              icon: <Icon name="trash" />,
              disabled: entry.children.length > 0,
              ...(entry.children.length > 0 ? { hint: "Move its files out first" } : {}),
              onSelect: () => void act("folder-remove", { path: entry.path }),
            },
          ]
        : [];
    return [
      { label: "Rename", icon: <Icon name="pencil" />, onSelect: () => setRenaming(entry.path) },
      ...(moveTo.length ? [{ label: "Move to", items: moveTo }] : []),
      ...folderItems,
    ];
  };

  const renameBox = (entry: Entry) => (
    <InlineText
      value={entry.name}
      label={`Rename ${entry.name}`}
      editing
      onEditingChange={(on) => setRenaming(on ? entry.path : null)}
      onSave={(name) => rename(entry, name)}
      maxLength={120}
      className="text-sm"
    />
  );

  const rows = (entries: Entry[], depth: number) =>
    entries.map((e) => {
      if (e.kind === "folder") {
        const shown = isOpen(e.path);
        return (
          <div
            key={e.path}
            className="rounded-md data-[over=true]:bg-sidebar-accent"
            {...dropOn(e.path)}
          >
            <div className={ROW} style={{ paddingLeft: 4 + depth * 16 }} {...dragFrom(e.path)}>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground"
                aria-label={`${shown ? "Close" : "Open"} ${e.name}`}
                aria-expanded={shown}
                onClick={() => setFolder(e.path, !shown)}
              >
                <IconChevronRight
                  size={14}
                  aria-hidden
                  className={shown ? "rotate-90 transition-transform" : "transition-transform"}
                />
              </Button>
              <span className={MAIN}>
                <Icon name={shown ? "folder-open" : "folder"} />
                {renaming === e.path ? (
                  renameBox(e)
                ) : (
                  <span className="truncate" title={e.name}>
                    {e.name}
                  </span>
                )}
              </span>
              <RowMenu label={`More for ${e.name}`} items={items(e)} quiet />
            </div>
            {shown &&
              (e.children.length ? (
                rows(e.children, depth + 1)
              ) : (
                <p
                  className="m-0 py-1.5 text-xs text-muted-foreground"
                  style={{ paddingLeft: 52 + depth * 16 }}
                >
                  Drag files here
                </p>
              ))}
          </div>
        );
      }
      return (
        <div
          key={e.path}
          className={ROW}
          style={{ paddingLeft: 32 + depth * 16 }}
          {...dragFrom(e.path)}
        >
          {renaming === e.path ? (
            <span className={MAIN}>
              <Icon name={FILE_ICON[e.type] ?? "file"} />
              {renameBox(e)}
            </span>
          ) : (
            <Link
              href={fileHref(e.path)}
              className={MAIN}
              aria-current={e.path === current ? "page" : undefined}
              title={e.title}
            >
              <Icon name={FILE_ICON[e.type] ?? "file"} />
              <span className="truncate">{e.title}</span>
            </Link>
          )}
          <RowMenu label={`More for ${e.title}`} items={items(e)} quiet />
        </div>
      );
    });

  return (
    <nav className="flex flex-col gap-0.5 px-3 pb-4" aria-label="Library">
      <div
        className="mt-2 flex items-center justify-between rounded-md py-1 pr-1 pl-3 data-[over=true]:bg-sidebar-accent"
        {...dropOn("")}
      >
        <span className="text-sm text-muted-foreground">Files</span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          aria-label="New folder"
          title="New folder"
          onClick={() => setNewIn("")}
        >
          <Icon name="folder-plus" />
        </Button>
      </div>
      {tree.length ? (
        rows(tree, 0)
      ) : (
        <p className="m-0 px-3 py-1.5 text-sm text-muted-foreground">No files yet.</p>
      )}
      <NewFolder
        inside={newIn}
        onClose={() => setNewIn(null)}
        onSave={async (name) => {
          const inside = newIn ?? "";
          const ok = await act("folder-create", { path: join(inside, name) });
          if (ok && inside) setFolder(inside, true);
          return ok;
        }}
      />
    </nav>
  );
}

function NewFolder({
  inside,
  onClose,
  onSave,
}: {
  inside: string | null;
  onClose: () => void;
  onSave: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  return (
    <FormDialog
      open={inside !== null}
      onOpenChange={(o) => {
        if (!o) {
          setName("");
          onClose();
        }
      }}
      title="New folder"
      line={inside ? `Inside ${inside}.` : "At the top of the library."}
      saveLabel="Make folder"
      onSave={async () => {
        if (!name.trim()) return false;
        const ok = await onSave(name.trim());
        if (ok) setName("");
        return ok;
      }}
    >
      <Field label="Name" htmlFor="folder-name">
        <Input
          id="folder-name"
          value={name}
          placeholder="research"
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
    </FormDialog>
  );
}
