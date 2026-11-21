export type FileKind = "markdown" | "text" | "pdf";
export type Entry =
  | { kind: "folder"; path: string; name: string; children: Entry[] }
  | { kind: "file"; path: string; name: string; title: string; type: FileKind };
export type Section = {
  order: number;
  id: string;
  title: string;
  level: number;
  text: string;
  parent: string | null;
};
export type Doc = {
  path: string;
  title: string;
  kind: FileKind;
  position: number;
  sections: Section[];
};
export type Turn = {
  id: number;
  file: string;
  said: string;
  reply: string;
  how: "command" | "agent";
  source: "voice" | "typed";
  at: number;
};

export type Outcome<T> =
  | { state: "succeeded"; output: T }
  | { state: "held" }
  | {
      state: "rejected" | "declined" | "expired" | "failed" | "interrupted";
      reason: { message: string };
    };

let onSignedOut = () => {};
export const whenSignedOut = (f: () => void) => {
  onSignedOut = f;
};

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(path, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers: { "x-kit-request": "1", "content-type": "application/json" },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  if (response.status === 401 && path !== "/api/session") onSignedOut();
  return response.json() as Promise<T>;
}

export const call = <T>(action: string, input: unknown = {}) =>
  api<Outcome<T>>("/api/calls", {
    method: "POST",
    body: { id: crypto.randomUUID(), action: `reader.${action}`, input },
  });

export async function read<T>(action: string, input: unknown = {}): Promise<T | undefined> {
  const outcome = await call<T>(action, input);
  return outcome.state === "succeeded" ? outcome.output : undefined;
}
