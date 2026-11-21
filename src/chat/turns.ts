import type { DatabaseSync } from "node:sqlite";
import type { TurnDetail } from "./trace.js";

export type Turn = {
  id: number;
  file: string;
  said: string;
  reply: string;
  how: "command" | "agent";
  source: "voice" | "typed";
  at: number;
  detail: TurnDetail | null;
};

export type Turns = {
  add(turn: Omit<Turn, "id" | "at">): Turn;
  list(file: string, limit?: number): Turn[];
  rename(from: string, to: string): void;
};

export function sqliteTurns(db: DatabaseSync, now: () => number = Date.now): Turns {
  db.exec(
    "CREATE TABLE IF NOT EXISTS turns (id INTEGER PRIMARY KEY AUTOINCREMENT, file TEXT NOT NULL, said TEXT NOT NULL, reply TEXT NOT NULL, how TEXT NOT NULL, source TEXT NOT NULL, at INTEGER NOT NULL)",
  );
  const columns = db.prepare("PRAGMA table_info(turns)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "detail"))
    db.exec("ALTER TABLE turns ADD COLUMN detail TEXT");
  const row = (r: unknown): Turn => {
    const t = r as Omit<Turn, "detail"> & { detail: string | null };
    return { ...t, detail: t.detail ? (JSON.parse(t.detail) as TurnDetail) : null };
  };
  return {
    add: (turn) =>
      row(
        db
          .prepare(
            "INSERT INTO turns (file, said, reply, how, source, at, detail) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *",
          )
          .get(
            turn.file,
            turn.said,
            turn.reply,
            turn.how,
            turn.source,
            now(),
            turn.detail ? JSON.stringify(turn.detail) : null,
          ),
      ),
    rename: (from, to) =>
      void db
        .prepare(
          "UPDATE turns SET file = ? || substr(file, ?) WHERE file = ? OR substr(file, 1, ?) = ?",
        )
        .run(to, from.length + 1, from, from.length + 1, `${from}/`),
    list: (file, limit = 200) =>
      db
        .prepare("SELECT * FROM turns WHERE file = ? ORDER BY id DESC LIMIT ?")
        .all(file, limit)
        .map(row)
        .reverse(),
  };
}
