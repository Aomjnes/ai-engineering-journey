"use client";

import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const axisTick = { fill: "var(--viz-text-2)", fontSize: 11 };
const tooltipStyle = { background: "var(--viz-surface)", border: "1px solid var(--viz-grid)", borderRadius: 6, color: "var(--viz-text)", fontSize: 12 };

function TableToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
      {show ? "Show chart" : "Show table"}
    </button>
  );
}

export interface RadarPoint {
  metric: string;
  value: number;
  hasEvidence: boolean;
}

/** Single-series 5-axis skill radar (no legend: the title names it). */
export function SkillRadar({ data }: { data: RadarPoint[] }) {
  const [table, setTable] = useState(false);
  return (
    <div>
      <div className="flex justify-end">
        <TableToggle show={table} onToggle={() => setTable((t) => !t)} />
      </div>
      {table ? (
        <table className="w-full text-sm">
          <tbody>
            {data.map((d) => (
              <tr key={d.metric} className="border-b last:border-0">
                <td className="py-1 font-medium">{d.metric}</td>
                <td className="py-1 text-right tabular-nums">{d.hasEvidence ? d.value.toFixed(1) : "no evidence yet"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <RadarChart data={data.map((d) => ({ ...d, label: d.hasEvidence ? d.metric : `${d.metric} (n/a)` }))} outerRadius="72%">
            <PolarGrid stroke="var(--viz-grid)" />
            <PolarAngleAxis dataKey="label" tick={axisTick} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar dataKey="value" stroke="var(--series-1)" strokeWidth={2} fill="var(--series-1)" fillOpacity={0.18} dot={{ r: 4, fill: "var(--series-1)", stroke: "var(--viz-surface)", strokeWidth: 2 }} isAnimationActive={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [Number(v).toFixed(1), "score"]} />
          </RadarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export interface TrendPoint {
  t: string;
  gai: number;
  lri: number;
  cpr: number;
  rss: number;
  eri: number;
}

const SERIES = [
  { key: "gai", name: "GAI", color: "var(--series-1)" },
  { key: "lri", name: "LRI", color: "var(--series-2)" },
  { key: "cpr", name: "CPR", color: "var(--series-3)" },
  { key: "rss", name: "RSS", color: "var(--series-4)" },
  { key: "eri", name: "ERI", color: "var(--series-5)" },
] as const;

const fmtDate = (t: string) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const [table, setTable] = useState(false);
  if (data.length < 2) return <p className="py-10 text-center text-sm text-muted-foreground">Trend appears after two recorded sessions.</p>;
  return (
    <div>
      <div className="flex justify-end">
        <TableToggle show={table} onToggle={() => setTable((t) => !t)} />
      </div>
      {table ? (
        <div className="max-h-60 overflow-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1">Date</th>
                {SERIES.map((s) => (
                  <th key={s.key} className="py-1 text-right">{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.t} className="border-b last:border-0">
                  <td className="py-1">{fmtDate(d.t)}</td>
                  {SERIES.map((s) => (
                    <td key={s.key} className="py-1 text-right">{d[s.key].toFixed(1)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis dataKey="t" tickFormatter={fmtDate} tick={axisTick} stroke="var(--viz-grid)" minTickGap={24} />
            <YAxis domain={[0, 100]} tick={axisTick} stroke="var(--viz-grid)" />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => fmtDate(String(l))} formatter={(v, n) => [Number(v).toFixed(1), n]} cursor={{ stroke: "var(--viz-text-2)", strokeDasharray: "3 3" }} />
            <Legend wrapperStyle={{ fontSize: 11, color: "var(--viz-text-2)" }} iconType="plainline" />
            {SERIES.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--viz-surface)", strokeWidth: 2 }} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function ErrorDecayChart({ data }: { data: Array<{ t: string; e100: number }> }) {
  if (data.length < 2) return <p className="py-10 text-center text-sm text-muted-foreground">Decay curve appears after two graded writing sessions.</p>;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
        <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
        <XAxis dataKey="t" tickFormatter={fmtDate} tick={axisTick} stroke="var(--viz-grid)" minTickGap={24} />
        <YAxis tick={axisTick} stroke="var(--viz-grid)" allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => fmtDate(String(l))} formatter={(v) => [`${Number(v).toFixed(1)} errors / 100 words`, "E/100W"]} />
        <Line type="monotone" dataKey="e100" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 4, fill: "var(--series-1)", stroke: "var(--viz-surface)", strokeWidth: 2 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Recurring-error heatmap: subtype × ISO week, sequential single-hue ramp, per-cell tooltip. */
export function ErrorHeatmap({ weeks, rows }: { weeks: string[]; rows: Array<{ subtype: string; total: number; cells: number[] }> }) {
  if (rows.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">No logged errors yet.</p>;
  const max = Math.max(1, ...rows.flatMap((r) => r.cells));
  const step = (v: number) => (v === 0 ? 0 : Math.min(6, 1 + Math.floor(((v - 1) / max) * 6)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate text-xs" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th className="text-left font-normal text-muted-foreground">Error pattern</th>
            {weeks.map((w) => (
              <th key={w} className="font-normal text-muted-foreground">{w.slice(5)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.subtype}>
              <td className="whitespace-nowrap pr-2 font-mono text-[11px]">{r.subtype}</td>
              {r.cells.map((v, i) => (
                <td key={weeks[i]} title={`${r.subtype} · ${weeks[i]}: ${v}`} className="h-6 min-w-6 rounded-[3px] text-center tabular-nums" style={{ background: `var(--seq-${step(v)})`, color: step(v) >= 4 ? "#fff" : "var(--viz-text-2)" }}>
                  {v > 0 ? v : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
