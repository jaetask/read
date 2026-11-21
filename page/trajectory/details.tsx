import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@jaetask/toolkit/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@jaetask/toolkit/ui/tabs";
import { appOf, type Row, type Session, secs, toolOf } from "./model";

const Pre = ({ children }: { children: unknown }) => (
  <pre className="my-1 rounded bg-muted p-3 text-xs break-words whitespace-pre-wrap">
    {typeof children === "string" ? children : JSON.stringify(children, null, 1)}
  </pre>
);

export function Tag({ r }: { r: Row }) {
  if (r.role === "tool" && r.by) {
    return (
      <span className="whitespace-nowrap">
        <span className="tj-tag agent">{r.by}</span>
        <span className="mx-1 text-[11px] text-muted-foreground">→</span>
        <span className={`tj-tag tool ${r.kind || ""}`}>{r.tag}</span>
      </span>
    );
  }
  return <span className={`tj-tag ${r.role} ${r.kind || ""}`}>{r.tag}</span>;
}

export function Details({
  row,
  session,
  onClose,
}: {
  row: Row | null;
  session: Session;
  onClose(): void;
}) {
  const t = row?.t;
  const c = row?.c;
  const tabs = c ? ["summary", "payload", "result", "timing"] : ["summary", "timing"];
  return (
    <Dialog
      open={!!row}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto p-6 sm:max-w-2xl">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 text-sm font-normal">
                <Tag r={row} />
                <span className="text-muted-foreground">
                  {row.turn != null ? `Turn ${row.turn} · Step ${row.step}` : "Session"}
                </span>
              </DialogTitle>
              <DialogDescription className="sr-only">
                One step of the conversation in full.
              </DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="summary" className="mt-3">
              <TabsList>
                {tabs.map((x) => (
                  <TabsTrigger key={x} value={x}>
                    {x[0]?.toUpperCase() + x.slice(1)}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="summary" className="text-sm">
                {row.role === "system" ? (
                  <Pre>{session.system_note || row.text}</Pre>
                ) : c ? (
                  <>
                    <p>
                      {row.by} called{" "}
                      <b>
                        {appOf(c.name)} · {toolOf(c.name)}
                      </b>{" "}
                      ({c.kind || "?"}) → <b>{c.outcome}</b> in {secs(c.duration_s)}.
                    </p>
                    <Pre>{row.text}</Pre>
                  </>
                ) : (
                  <Pre>{row.more ? `${row.text}\n\n${row.more}` : row.text}</Pre>
                )}
              </TabsContent>
              <TabsContent value="payload" className="text-sm">
                {c && <Pre>{c.args || {}}</Pre>}
              </TabsContent>
              <TabsContent value="result" className="text-sm">
                {c && <Pre>{c.result || "(no result saved)"}</Pre>}
              </TabsContent>
              <TabsContent value="timing" className="text-sm">
                {c ? (
                  <Pre>
                    {{
                      started_into_turn: secs(c.start_s),
                      took: secs(c.duration_s),
                      outcome: c.outcome,
                      by: row.by,
                    }}
                  </Pre>
                ) : (
                  <Pre>
                    {{
                      spans: (t?.spans || []).map((x) => ({
                        kind: x.kind,
                        label: x.label,
                        from: secs(x.start),
                        to: secs(x.end),
                        first_token: x.first != null ? secs(x.first) : undefined,
                      })),
                      total: secs(t?.timings?.total),
                      source: t?.source || "—",
                    }}
                  </Pre>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
