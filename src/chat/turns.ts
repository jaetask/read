import type { DatabaseSync } from "node:sqlite";

export type Turn = {
  id: number;
  file: string;
  said: string;
  reply: string;
  how: "command" | "agent";
  source: "voice" | "typed";
  at: number;
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
  return {
    add: (turn) =>
      db
        .prepare(
          "INSERT INTO turns (file, said, reply, how, source, at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *",
        )
        .get(turn.file, turn.said, turn.reply, turn.how, turn.source, now()) as Turn,
    rename: (from, to) =>
      void db
        .prepare(
          "UPDATE turns SET file = ? || substr(file, ?) WHERE file = ? OR substr(file, 1, ?) = ?",
        )
        .run(to, from.length + 1, from, from.length + 1, `${from}/`),
    list: (file, limit = 200) =>
      (
        db
          .prepare("SELECT * FROM turns WHERE file = ? ORDER BY id DESC LIMIT ?")
          .all(file, limit) as Turn[]
      ).reverse(),
  };
}
