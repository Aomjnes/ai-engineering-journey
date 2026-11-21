"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";

const axisTick = { fill: "var(--viz-text-2)", fontSize: 11, fontFamily: "var(--font-mono)" };
const fmtDate = (t: string) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Crisp, glass-free tooltip with tabular numbers. */
interface TooltipEntry {
  dataKey?: unknown;
  name?: unknown;
  value?: unknown;
  color?: string;
}

function ChartTooltip({ active, payload, label, labelFormat, unit }: { active?: boolean; payload?: readonly TooltipEntry[]; label?: unknown; labelFormat?: (l: string) => string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-card px-3 py-2 text-[12px] shadow-lift">
      {label !== undefined && <p className="mb-1 text-ink-3">{labelFormat ? labelFormat(String(label)) : String(label)}</p>}
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-ink-2">
          <span className="h-0.5 w-3 rounded" style={{ background: p.color }} aria-hidden />
          <span className="min-w-10">{String(p.name)}</span>
          <span className="num ml-auto font-medium text-ink">
            {typeof p.value === "number" ? p.value.toFixed(1) : String(p.value)}
            {unit}
          </span>
        </p>
      ))}
    </div>
  );
}

function TableToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="text-[12px] text-ink-3 underline-offset-4 hover:text-ink hover:underline">
      {show ? "Chart" : "Table"}
    </button>
  );
}

export interface RadarPoint {
  metric: string;
  value: number;
  hasEvidence: boolean;
}

/** 5-axis radar (single series, no legend) with an optional dashed benchmark ring for the next band. */
export function SkillRadar({ data, benchmark, height = 260 }: { data: RadarPoint[]; benchmark?: number | null; height?: number }) {
  const [table, setTable] = useState(false);
  const rows = data.map((d) => ({ ...d, label: d.hasEvidence ? d.metric : `${d.metric} ·  n/a`, plotted: d.hasEvidence ? d.value : 0, bench: benchmark ?? 0 }));
  return (
    <div>
      <div className="flex items-center justify-between">
        {benchmark ? (
          <p className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
            <span className="w-4 border-t border-dashed border-ink-3" aria-hidden /> next-band threshold <span className="num text-ink-2">{benchmark}</span>
          </p>
        ) : (
          <span />
        )}
        <TableToggle show={table} onToggle={() => setTable((t) => !t)} />
      </div>
      {table ? (
        <table className="mt-2 w-full text-[13px]">
          <tbody>
            {data.map((d) => (
              <tr key={d.metric} className="border-b border-line last:border-0">
                <td className="py-1.5 font-medium">{d.metric}</td>
                <td className="num py-1.5 text-right">{d.hasEvidence ? d.value.toFixed(1) : "no evidence yet"}</td>
                {benchmark ? <td className="num py-1.5 text-right text-ink-3">/ {benchmark}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <RadarChart data={rows} outerRadius="70%">
            <PolarGrid stroke="var(--viz-grid)" strokeDasharray="3 3" />
            <PolarAngleAxis dataKey="label" tick={{ ...axisTick, fontFamily: "var(--font-sans)", fontWeight: 600 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            {benchmark ? <Radar dataKey="bench" name="Next-band threshold" stroke="var(--viz-text-2)" strokeDasharray="4 4" strokeWidth={1.25} fill="none" isAnimationActive={false} /> : null}
            <Radar dataKey="plotted" name="Score" stroke="var(--series-1)" strokeWidth={2} fill="var(--series-1)" fillOpacity={0.12} dot={{ r: 3.5, fill: "var(--series-1)", stroke: "var(--viz-surface)", strokeWidth: 2 }} isAnimationActive={false} />
            <Tooltip content={<ChartTooltip />} />
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
  composite: number;
}

const SERIES = [
  { key: "gai", name: "GAI", color: "var(--series-1)" },
  { key: "lri", name: "LRI", color: "var(--series-2)" },
  { key: "cpr", name: "CPR", color: "var(--series-3)" },
  { key: "rss", name: "RSS", color: "var(--series-4)" },
  { key: "eri", name: "ERI", color: "var(--series-5)" },
] as const;
type SeriesKey = (typeof SERIES)[number]["key"];

/** 30-day trajectory on a single 0–100 axis; series are toggleable (the legend is the toggle). */
export function TrajectoryChart({ data, initial = ["gai", "lri"] }: { data: TrendPoint[]; initial?: SeriesKey[] }) {
  const [on, setOn] = useState<Set<SeriesKey>>(new Set(initial));
  const [table, setTable] = useState(false);
  if (data.length < 2) return <p className="py-12 text-center text-[13px] text-ink-3">The trajectory appears after two recorded sessions.</p>;
  const toggle = (k: SeriesKey) =>
    setOn((s) => {
      const n = new Set(s);
      if (n.has(k) && n.size > 1) n.delete(k);
      else n.add(k);
      return n;
    });
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {SERIES.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={on.has(s.key)}
            onClick={() => toggle(s.key)}
            className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-colors", on.has(s.key) ? "border-line-strong bg-card text-ink" : "border-transparent bg-surface text-ink-3")}
          >
            <span className="h-0.5 w-3 rounded" style={{ background: on.has(s.key) ? s.color : "var(--viz-grid)" }} aria-hidden />
            {s.name}
          </button>
        ))}
        <span className="ml-auto">
          <TableToggle show={table} onToggle={() => setTable((t) => !t)} />
        </span>
      </div>
      {table ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-ink-3">
                <th className="py-1 font-medium">Date</th>
                {SERIES.map((s) => (
                  <th key={s.key} className="py-1 text-right font-medium">{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.t} className="border-t border-line">
                  <td className="num py-1">{fmtDate(d.t)}</td>
                  {SERIES.map((s) => (
                    <td key={s.key} className="num py-1 text-right">{d[s.key].toFixed(1)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data} margin={{ top: 8, right: 20, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="t" tickFormatter={fmtDate} tick={axisTick} stroke="var(--viz-grid)" tickLine={false} minTickGap={28} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={axisTick} stroke="var(--viz-grid)" tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltip labelFormat={fmtDate} />} cursor={{ stroke: "var(--viz-text-2)", strokeDasharray: "3 3", strokeWidth: 1 }} />
            {SERIES.filter((s) => on.has(s.key)).map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--viz-surface)", strokeWidth: 2 }} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/** Errors per 100 words — its own scale, so its own chart (never a second y-axis). */
export function ErrorDecayChart({ data, height = 200 }: { data: Array<{ t: string; e100: number }>; height?: number }) {
  if (data.length < 2) return <p className="py-12 text-center text-[13px] text-ink-3">The decay curve appears after two graded writing sessions.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 20, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="3 4" vertical={false} />
        <XAxis dataKey="t" tickFormatter={fmtDate} tick={axisTick} stroke="var(--viz-grid)" tickLine={false} minTickGap={28} />
        <YAxis tick={axisTick} stroke="var(--viz-grid)" tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<ChartTooltip labelFormat={fmtDate} unit=" /100w" />} cursor={{ stroke: "var(--viz-text-2)", strokeDasharray: "3 3", strokeWidth: 1 }} />
        <Line type="monotone" dataKey="e100" name="E/100W" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 3.5, fill: "var(--series-1)", stroke: "var(--viz-surface)", strokeWidth: 2 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Recurring-error heatmap: pattern × ISO week, single-hue sequential ramp, per-cell tooltip. */
export function ErrorHeatmap({ weeks, rows }: { weeks: string[]; rows: Array<{ subtype: string; total: number; cells: number[] }> }) {
  if (rows.length === 0) return <p className="py-12 text-center text-[13px] text-ink-3">No logged errors yet.</p>;
  const max = Math.max(1, ...rows.flatMap((r) => r.cells));
  const step = (v: number) => (v === 0 ? 0 : Math.min(6, 1 + Math.floor(((v - 1) / max) * 6)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate text-[11.5px]" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th className="text-left font-medium text-ink-3">Pattern</th>
            {weeks.map((w) => (
              <th key={w} className="num font-normal text-ink-3">{w.slice(5)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.subtype}>
              <td className="whitespace-nowrap pr-3 font-mono text-[11px] text-ink-2">{r.subtype}</td>
              {r.cells.map((v, i) => (
                <td key={weeks[i]} title={`${r.subtype} · ${weeks[i]}: ${v}`} className="num h-6 min-w-7 rounded-[3px] text-center" style={{ background: `var(--seq-${step(v)})`, color: step(v) >= 4 ? "#fff" : "var(--viz-text-2)" }}>
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
