import { Button } from "@jaetask/toolkit/ui/button";
import { Input } from "@jaetask/toolkit/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@jaetask/toolkit/ui/toggle-group";
import { IconDownload } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { read } from "./api";
import { Details, Tag } from "./trajectory/details";
import { type Mode, rows, searchText, type Timeline, type Turn } from "./trajectory/model";
import { Strip } from "./trajectory/strip";

const MODE_KEY = "read:trajectory-mode";

type Stored = {
  session: { agent_name: string; system_note: string };
  turns: {
    id: number;
    idx: number;
    source: string;
    user_text: string;
    reply: string;
    at: number;
    detail: (Omit<Turn, "id" | "idx" | "user_text"> & { route_how: string }) | null;
  }[];
};

const toTimeline = (s: Stored): Timeline => ({
  session: s.session,
  turns: s.turns.map((t) => ({
    ...(t.detail ?? {}),
    id: t.id,
    idx: t.idx,
    source: t.source,
    user_text: t.user_text,
    reply: t.reply,
  })),
});

function savedMode(): Mode {
  try {
    return (localStorage.getItem(MODE_KEY) as Mode) || "duration";
  } catch {
    return "duration";
  }
}

export function Trajectory({ file, turns }: { file: string | null; turns: number }) {
  const [mode, setMode] = useState<Mode>(savedMode);
  const [words, setWords] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [data, setData] = useState<Timeline | null>(null);
  useEffect(() => {
    let live = true;
    void read<Stored>("chat-timeline", file ? { file } : {}).then((d) => {
      if (live && turns >= 0) setData(d ? toTimeline(d) : null);
    });
    return () => {
      live = false;
    };
  }, [file, turns]);
  const all = useMemo(() => (data ? rows(data.session, data.turns, data.agents) : []), [data]);
  const q = words.trim().toLowerCase();
  const shown = q ? all.filter((r) => searchText(r).includes(q)) : all;
  const pick = (id: string) => {
    setPicked(id);
    document.getElementById(`tj-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  const download = () => {
    if (!data) return;
    const lines = data.turns.map((t) => JSON.stringify(t)).join("\n");
    const url = URL.createObjectURL(new Blob([`${lines}\n`], { type: "application/x-ndjson" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(file ?? "chat").replace(/[^\w.-]+/g, "-")}.log.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (data && !data.turns.length)
    return <p className="m-auto text-sm text-muted-foreground">No turns yet.</p>;
  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Trajectory">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <ToggleGroup
          type="single"
          size="sm"
          value={mode}
          aria-label="Timeline scale"
          onValueChange={(v) => {
            if (!v) return;
            setMode(v as Mode);
            try {
              localStorage.setItem(MODE_KEY, v);
            } catch {
              return;
            }
          }}
        >
          <ToggleGroupItem value="duration">Duration</ToggleGroupItem>
          <ToggleGroupItem value="turns">Turns</ToggleGroupItem>
          <ToggleGroupItem value="calls">Calls</ToggleGroupItem>
        </ToggleGroup>
        <Input
          type="search"
          className="ml-auto h-8 w-56"
          placeholder="Search"
          aria-label="Search the log"
          value={words}
          onChange={(e) => setWords(e.target.value)}
        />
        <Button size="sm" variant="outline" className="gap-1.5" onClick={download}>
          <IconDownload size={14} aria-hidden /> Session log
        </Button>
      </div>
      {data && (
        <div className="border-b border-border bg-muted/30">
          <Strip data={data} mode={mode} onPick={pick} />
        </div>
      )}
      <ol className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0" aria-label="Every step">
        {shown.map((r, i) => {
          const firstOfTurn = r.turn != null && (i === 0 || shown[i - 1]?.turn !== r.turn);
          return (
            <li key={r.id} id={`tj-${r.id}`}>
              <Button
                variant="ghost"
                onClick={() => setPicked(r.id)}
                className={`grid h-auto w-full grid-cols-[64px_minmax(120px,auto)_1fr] items-start gap-3 rounded-none border-b border-border/60 py-2 pr-4 pl-3 text-left text-sm font-normal ${picked === r.id ? "bg-accent/60" : ""}`}
              >
                <span className="pl-2 text-[10px] text-muted-foreground">
                  {firstOfTurn && (
                    <span className="rounded bg-muted px-1 py-px">Turn {r.turn}</span>
                  )}
                </span>
                <span className="text-right">
                  <Tag r={r} />
                </span>
                <span
                  className={`min-w-0 truncate ${r.mono ? "font-mono text-[13px]" : ""} ${r.bad ? "text-destructive" : ""}`}
                >
                  {r.text}
                </span>
              </Button>
            </li>
          );
        })}
      </ol>
      <Details
        row={all.find((r) => r.id === picked) ?? null}
        session={data?.session ?? {}}
        onClose={() => setPicked(null)}
      />
    </section>
  );
}
