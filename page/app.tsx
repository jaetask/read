import { AppShell, LinkProvider, type LinkComponent } from "@jaetask/toolkit/suite";
import { useCallback, useEffect, useRef, useState } from "react";
import { call, type Doc, type Entry, read, type Turn } from "./api";
import { ChatPane } from "./chat";
import { Icon } from "./icons";
import { fileHref, Library } from "./library";
import { Reader } from "./reader";
import { Split } from "./split";
import {
  connect,
  disconnect,
  type Line,
  resetLines,
  stopSpeaking,
  unlockAudio,
  useVoice,
} from "./voice";

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

function _firstFile(entry: Entry): string | undefined {
  if (entry.kind === "file") return entry.path;
  for (const child of entry.children) {
    const found = _firstFile(child);
    if (found) return found;
  }
  return undefined;
}

const toLines = (turns: Turn[]): Line[] =>
  turns.flatMap((t) => [
    { id: `t${t.id}p`, from: "person" as const, text: t.said },
    ...(t.reply ? [{ id: `t${t.id}r`, from: "reader" as const, text: t.reply }] : []),
  ]);

function App() {
  const route = useHashPath();
  const [tree, setTree] = useState<Entry[]>([]);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [problem, setProblem] = useState("");
  const voice = useVoice();
  const wanted = fileOf(route);

  const refreshTree = useCallback(async () => {
    setTree((await read<Entry[]>("file-list")) ?? []);
  }, []);

  useEffect(() => {
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
  }, [refreshTree]);

  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!voice.connected || !wanted || asked.current === wanted) return;
    asked.current = wanted;
    if (wanted !== voice.path) void call("reader-open", { file: wanted });
  }, [voice.connected, wanted, voice.path]);

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

  const shown = doc && doc.path === voice.path && wanted ? doc : null;
  const act = (action: string, input: unknown = {}) => {
    unlockAudio();
    if (action === "reader-pause") stopSpeaking();
    void call(action, input);
  };
  const pane = (
    <ChatPane voice={voice} file={voice.path} problem={problem} onDismiss={() => setProblem("")} />
  );

  return (
    <AppShell
      app={{ name: "Read", href: "/" }}
      bar={false}
      nav={[{ href: "/", label: "Library", icon: <Icon name="books" />, current: !shown }]}
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
    >
      <div className="read-frame">
        {shown ? (
          <Split
            id="read.layout.reader"
            leftId="document"
            rightId="pane"
            leftSize={50}
            minLeft={30}
            maxLeft={75}
            minRight={25}
            left={
              <Reader
                file={shown}
                index={voice.index}
                playing={voice.playing}
                heard={voice.heard}
                onPlay={() => act("reader-resume")}
                onPause={() => act("reader-pause")}
                onNext={() => act("reader-next")}
                onPrev={() => act("reader-previous")}
                onGoto={(i) => act("reader-goto", { index: i, play: true })}
                onClose={() => {
                  stopSpeaking();
                  void call("reader-close").then(() => go("/"));
                }}
              />
            }
            right={pane}
          />
        ) : (
          pane
        )}
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
