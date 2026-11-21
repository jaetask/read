import {
  AppShell,
  CenteredPage,
  LinkProvider,
  type LinkComponent,
  PageBody,
  Panel,
} from "@jaetask/toolkit/suite";
import { Button } from "@jaetask/toolkit/ui/button";
import { Input } from "@jaetask/toolkit/ui/input";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, call, type Doc, type Entry, read, type Turn, whenSignedOut } from "./api";
import { Chat } from "./chat";
import { Icon } from "./icons";
import { fileHref, Library } from "./library";
import { Reader } from "./reader";
import { connect, disconnect, hush, type Line, resetLines, unlockAudio, useVoice } from "./voice";

const hashPath = () => window.location.hash.replace(/^#/, "") || "/";

function useHashPath() {
  const [path, setPath] = useState(hashPath);
  useEffect(() => {
    const on = () => setPath(hashPath());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return path;
}

const go = (path: string) => {
  window.location.hash = path;
};

const HashLink: LinkComponent = ({ href, children, ...rest }) => (
  <a href={href.startsWith("/") ? `#${href}` : href} {...rest}>
    {children}
  </a>
);

const fileOf = (route: string) =>
  route.startsWith("/file/") ? route.slice(6).split("/").map(decodeURIComponent).join("/") : null;

function firstFile(entry: Entry): string | undefined {
  if (entry.kind === "file") return entry.path;
  for (const child of entry.children) {
    const found = firstFile(child);
    if (found) return found;
  }
  return undefined;
}

const toLines = (turns: Turn[]): Line[] =>
  turns.flatMap((t) => [
    { id: `t${t.id}p`, from: "person" as const, text: t.said },
    ...(t.reply ? [{ id: `t${t.id}r`, from: "reader" as const, text: t.reply }] : []),
  ]);

function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const answer = await api<{ signedIn: boolean; error?: string }>("/api/session", {
      method: "POST",
      body: { secret },
    });
    setSecret("");
    setError(answer.signedIn ? "" : (answer.error ?? "Could not sign in."));
    if (answer.signedIn) onSignedIn();
  };
  return (
    <div className="tk-root">
      <CenteredPage
        title="Sign in to Read"
        line="Enter the setup secret Read printed when it first started."
      >
        <form className="read-sign-in" onSubmit={submit}>
          <Input
            type="password"
            aria-label="Setup secret"
            autoComplete="current-password"
            placeholder="Setup secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            required
          />
          <Button type="submit" size="icon" aria-label="Sign in" title="Sign in">
            <Icon name="arrow-right" />
          </Button>
        </form>
        {error && (
          <p className="read-error" role="alert">
            {error}
          </p>
        )}
      </CenteredPage>
    </div>
  );
}

function Controls({ doc, playing, index }: { doc: Doc; playing: boolean; index: number }) {
  const act = (action: string, input: unknown = {}) => {
    unlockAudio();
    if (action === "reader-pause") hush();
    void call(action, input);
  };
  const last = doc.sections.length - 1;
  return (
    <div className="read-controls">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Previous section"
        title="Previous section"
        disabled={index <= 0}
        onClick={() => act("reader-previous")}
      >
        <Icon name="player-track-prev" />
      </Button>
      <Button
        size="icon"
        aria-label={playing ? "Pause" : "Read aloud"}
        title={playing ? "Pause" : "Read aloud"}
        onClick={() => (playing ? act("reader-pause") : act("reader-resume"))}
      >
        <Icon name={playing ? "player-pause" : "player-play"} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Next section"
        title="Next section"
        disabled={index >= last}
        onClick={() => act("reader-next")}
      >
        <Icon name="player-track-next" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Close the file"
        title="Close the file"
        onClick={() => {
          hush();
          void call("reader-close").then(() => go("/"));
        }}
      >
        <Icon name="x" />
      </Button>
    </div>
  );
}

function Home({ tree }: { tree: Entry[] }) {
  const first = tree.map(firstFile).find(Boolean);
  return (
    <PageBody
      title="Library"
      line="Pick a file on the left. Read reads it aloud and answers questions about it."
    >
      <Panel
        id="library"
        title={first ? "Start reading" : "No files yet"}
        line={
          first
            ? "Open a file to read it together."
            : "Put Markdown, text or PDF files in the library folder. Folders show on the left."
        }
      >
        {first && (
          <Button variant="outline" onClick={() => go(fileHref(first))}>
            <Icon name="book" />
            Open the first file
          </Button>
        )}
      </Panel>
    </PageBody>
  );
}

function SettingsPage({ onSignOut }: { onSignOut: () => void }) {
  return (
    <PageBody title="Settings" line="This browser's session.">
      <Panel
        id="session"
        title="Session"
        line="Signing out ends the session in this browser only."
        action={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            title="Sign out"
            onClick={onSignOut}
          >
            <Icon name="logout" />
          </Button>
        }
      >
        <p className="tk-muted">You are signed in with the setup secret.</p>
      </Panel>
    </PageBody>
  );
}

function App() {
  const route = useHashPath();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [tree, setTree] = useState<Entry[]>([]);
  const [doc, setDoc] = useState<Doc | null>(null);
  const voice = useVoice();
  const wanted = fileOf(route);

  useEffect(() => {
    whenSignedOut(() => setSignedIn(false));
    void api<{ signedIn: boolean }>("/api/session").then((s) => setSignedIn(s.signedIn));
  }, []);

  const refreshTree = useCallback(async () => {
    setTree((await read<Entry[]>("file-list")) ?? []);
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    connect();
    void refreshTree();
    const onFocus = () => void refreshTree();
    window.addEventListener("focus", onFocus);
    const every = setInterval(refreshTree, 15000);
    const changes = new EventSource("/events");
    changes.addEventListener("change", () => void refreshTree());
    return () => {
      changes.close();
      window.removeEventListener("focus", onFocus);
      clearInterval(every);
      disconnect();
    };
  }, [signedIn, refreshTree]);

  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!signedIn || !voice.connected || !wanted || asked.current === wanted) return;
    asked.current = wanted;
    if (wanted !== voice.path) void call("reader-open", { file: wanted });
  }, [signedIn, voice.connected, wanted, voice.path]);

  const followed = useRef(false);
  useEffect(() => {
    if (!voice.path) return;
    const first = !followed.current && route === "/";
    followed.current = true;
    const moved =
      route.startsWith("/file/") && asked.current === fileOf(route) && asked.current !== voice.path;
    if (first || moved) {
      asked.current = voice.path;
      go(fileHref(voice.path));
    }
  }, [voice.path, route]);

  useEffect(() => {
    if (!voice.path) {
      setDoc(null);
      return;
    }
    let live = true;
    void Promise.all([
      read<Doc>("file-get", { path: voice.path }),
      read<Turn[]>("chat-turns", { file: voice.path }),
    ]).then(([d, turns]) => {
      if (!live) return;
      setDoc(d ?? null);
      resetLines(toLines(turns ?? []));
    });
    return () => {
      live = false;
    };
  }, [voice.path]);

  if (signedIn === null) return null;
  if (!signedIn) return <SignIn onSignedIn={() => setSignedIn(true)} />;

  const signOut = async () => {
    await api("/api/session", { method: "DELETE" });
    setSignedIn(false);
  };
  const shown = doc && doc.path === voice.path ? doc : null;
  const page = route === "/settings" ? "settings" : shown && wanted ? "file" : "home";

  return (
    <AppShell
      app={{ name: "Read", href: "/" }}
      title={page === "file" && shown ? shown.title : page === "settings" ? "Settings" : "Library"}
      topAside={
        page === "file" && shown ? (
          <Controls doc={shown} playing={voice.playing} index={voice.index} />
        ) : undefined
      }
      nav={[{ href: "/", label: "Library", icon: <Icon name="books" />, current: page === "home" }]}
      side={(collapsed) =>
        collapsed ? null : (
          <Library tree={tree} current={voice.path} onChanged={() => void refreshTree()} />
        )
      }
      settingsHref="/settings"
    >
      {page === "settings" ? (
        <SettingsPage onSignOut={signOut} />
      ) : (
        <div className="read-split">
          <div className="read-main">
            {page === "file" && shown ? (
              <Reader
                doc={shown}
                index={voice.index}
                heard={voice.heard}
                onGoto={(i) => {
                  unlockAudio();
                  void call("reader-goto", { index: i, play: true });
                }}
              />
            ) : (
              <Home tree={tree} />
            )}
          </div>
          <Chat voice={voice} title={shown?.title ?? null} />
        </div>
      )}
    </AppShell>
  );
}

export function Root() {
  const path = useHashPath();
  return (
    <LinkProvider link={HashLink} location={path}>
      <App />
    </LinkProvider>
  );
}
