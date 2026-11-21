import {
  AppShell,
  CenteredPage,
  EmptyLine,
  IconAction,
  LinkProvider,
  type LinkComponent,
  WorkPage,
} from "@jaetask/toolkit/suite";
import { IconArrowLeft } from "@tabler/icons-react";
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
  const act = (action: string) => {
    unlockAudio();
    if (action === "reader-pause") hush();
    void call(action);
  };
  const last = doc.sections.length - 1;
  return (
    <>
      {index > 0 && (
        <IconAction
          label="Previous section"
          icon={<Icon name="previous" />}
          onClick={() => act("reader-previous")}
        />
      )}
      {playing ? (
        <IconAction
          label="Pause"
          primary
          icon={<Icon name="pause" />}
          onClick={() => act("reader-pause")}
        />
      ) : (
        <IconAction
          label="Read aloud"
          primary
          icon={<Icon name="play" />}
          onClick={() => act("reader-resume")}
        />
      )}
      {index < last && (
        <IconAction
          label="Next section"
          icon={<Icon name="next" />}
          onClick={() => act("reader-next")}
        />
      )}
      <IconAction
        label="Close the file"
        icon={<Icon name="close" />}
        onClick={() => {
          hush();
          void call("reader-close").then(() => go("/"));
        }}
      />
    </>
  );
}

const READ_HELP =
  'Read reads the file aloud and highlights the sentence you hear. Click a heading to read from there. Talk or type: "next", "pause", "read it again", "read section two", "open the Orca file", or ask a question about the file.';

function Home({ tree }: { tree: Entry[] }) {
  const first = tree.map(firstFile).find(Boolean);
  return (
    <WorkPage
      title="Library"
      help="Your folders and files are on the left. Open one to read it aloud together. Make folders with the button next to Files and drag files into them."
      action={
        first ? (
          <IconAction
            label="Open the first file"
            icon={<Icon name="book" />}
            href={fileHref(first)}
          />
        ) : undefined
      }
    >
      <EmptyLine>
        {first
          ? 'Pick a file on the left, or say "open" and its name.'
          : "No files yet. Put Markdown, text or PDF files in the library folder."}
      </EmptyLine>
    </WorkPage>
  );
}

function SettingsPage({ onSignOut }: { onSignOut: () => void }) {
  return (
    <WorkPage
      title="This browser"
      help="You are signed in with the setup secret. Signing out ends the session in this browser only."
      action={<IconAction label="Sign out" icon={<Icon name="logout" />} onClick={onSignOut} />}
    >
      <EmptyLine>Signed in. A session lasts 30 days.</EmptyLine>
    </WorkPage>
  );
}

function App() {
  const route = useHashPath();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [tree, setTree] = useState<Entry[]>([]);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [problem, setProblem] = useState("");
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

  if (page === "settings")
    return (
      <AppShell
        app={{ name: "Read", href: "/" }}
        bar={false}
        nav={[
          { href: "/", label: "Back to Read", icon: <IconArrowLeft size={16} aria-hidden /> },
          { href: "/settings", label: "This browser", icon: <Icon name="logout" />, current: true },
        ]}
      >
        <SettingsPage onSignOut={signOut} />
      </AppShell>
    );

  return (
    <AppShell
      app={{ name: "Read", href: "/" }}
      bar={false}
      nav={[{ href: "/", label: "Library", icon: <Icon name="books" />, current: page === "home" }]}
      side={(collapsed) =>
        collapsed ? null : (
          <Library
            tree={tree}
            current={voice.path}
            onChanged={() => void refreshTree()}
            onError={setProblem}
          />
        )
      }
      settingsHref="/settings"
    >
      <div className="read-split">
        <div className="read-main">
          {page === "file" && shown ? (
            <WorkPage
              title={shown.title}
              help={READ_HELP}
              action={<Controls doc={shown} playing={voice.playing} index={voice.index} />}
              wide
            >
              <Reader
                doc={shown}
                index={voice.index}
                heard={voice.heard}
                onGoto={(i) => {
                  unlockAudio();
                  void call("reader-goto", { index: i, play: true });
                }}
              />
            </WorkPage>
          ) : (
            <Home tree={tree} />
          )}
        </div>
        <Chat
          voice={voice}
          title={shown?.title ?? null}
          problem={problem}
          onDismiss={() => setProblem("")}
        />
      </div>
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
