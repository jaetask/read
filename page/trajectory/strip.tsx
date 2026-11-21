import type { CSSProperties } from "react";
import { type Bar, bars, LANES, type Mode, placement, secs, type Timeline } from "./model";

const LANE_H = 10;
const LANE_GAP = 8;
const TOP = 8;

export function Strip({
  data,
  mode,
  onPick,
}: {
  data: Timeline;
  mode: Mode;
  onPick(rowId: string): void;
}) {
  const { out, total } = bars(data.turns, data.agents);
  const real = out.filter((b): b is Bar => !("boundary" in b));
  const n = data.turns.length || 1;
  return (
    <figure className="tj-strip m-0" aria-label="Timeline">
      <div className="tj-lanes">
        {LANES.map(([name], k) => (
          <div key={name} className="tj-lane" style={{ top: TOP + k * (LANE_H + LANE_GAP) - 2 }}>
            {name}
          </div>
        ))}
      </div>
      <div className="tj-plot" style={{ height: TOP + LANES.length * (LANE_H + LANE_GAP) }}>
        {out.map((b) => {
          if ("boundary" in b) {
            const left =
              mode === "turns"
                ? b.ti / n
                : mode === "calls"
                  ? Math.max(
                      real.findIndex((r) => r.ti === b.ti),
                      0,
                    ) / Math.max(real.length, 1)
                  : b.gs / total;
            return (
              <div
                key={`b${b.turn}`}
                className="tj-turn"
                style={{ left: `${(left * 100).toFixed(3)}%` }}
              >
                <span>{b.turn}</span>
              </div>
            );
          }
          const [l, r] = placement(b, mode, real, n, total);
          const style: CSSProperties & Record<string, string | number> = {
            left: `${(l * 100).toFixed(3)}%`,
            width: `max(2px, ${((r - l) * 100).toFixed(3)}%)`,
            top: TOP + b.lane * (LANE_H + LANE_GAP),
          };
          if (b.kind === "llm" && b.first != null && b.first > b.start && b.first < b.end) {
            style["--first"] = `${Math.round(((b.first - b.start) / (b.end - b.start)) * 100)}%`;
          }
          const tip =
            `Turn ${b.turn} · ${b.label || b.kind}\n${secs(b.end - b.start)}` +
            (b.first != null ? ` (first token after ${secs(b.first - b.start)})` : "") +
            (b.bad ? "\nfailed" : "");
          return (
            <button
              key={`${b.row}-${b.kind}-${b.start}`}
              type="button"
              className={`tj-bar ${b.kind} ${b.tkind || ""} ${b.bad ? "bad" : ""}`}
              style={style}
              title={tip}
              aria-label={tip.replace("\n", ", ")}
              onClick={() => onPick(b.row)}
            />
          );
        })}
      </div>
    </figure>
  );
}
