import { barX, barY, cell, defineChart, lineY, stack } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { PROVIDERS, type Provider, type Summary } from "../../shared/metrics.mjs";
import {
  GOLD,
  WEEKDAYS,
  count,
  hourLabel,
  longDay,
  pct,
  providerColor,
  providerLabel,
  shortDay,
  tokens,
  usd,
  usdTick,
} from "./format";

export type TimelineMetric = "usd" | "tokens" | "events";

const providerColorScale = {
  domain: [...PROVIDERS],
  range: PROVIDERS.map((provider) => providerColor[provider]),
};

const quietGrid = { stroke: "currentColor", opacity: 0.07 };
const tooltipClass = "lots-tooltip";

const metricFormat: Record<TimelineMetric, (value: number) => string> = {
  usd,
  tokens,
  events: count,
};

const metricTick: Record<TimelineMetric, (value: number) => string> = {
  usd: usdTick,
  tokens,
  events: count,
};

/** Evenly spaced tick values that always include the last key. */
function spacedTicks(keys: readonly string[], target: number) {
  const step = Math.max(1, Math.ceil(keys.length / target));
  return keys.filter((_, index) => (keys.length - 1 - index) % step === 0);
}

export function timelineChart(summary: Summary, metric: TimelineMetric, narrow: boolean) {
  const rows = summary.series.rows.map((row) => ({
    key: row.key,
    provider: row.provider,
    label: providerLabel[row.provider],
    value: metric === "usd" ? row.usd : metric === "tokens" ? row.tokens : row.events,
  }));
  const paid = summary.series.paid.filter(() => metric === "usd");
  const showPaid = paid.some((point) => point.usd > 0);
  const keys = summary.series.keys;
  const label = (key: string) => (summary.hourly ? hourLabel(Number(key)) : shortDay(key));
  const heading = (key: string) => (summary.hourly ? `${hourLabel(Number(key))} today` : longDay(key));
  const format = metricFormat[metric];
  const empty = rows.every((row) => row.value === 0);

  return defineChart({
    marks: [
      barY(rows, {
        id: "usage",
        x: "key",
        y: "value",
        z: "provider",
        color: "provider",
        key: (row) => `${row.key}:${row.provider}`,
        radius: { end: 2 },
        layout: stack({ order: [...PROVIDERS] }),
      }),
      lineY(showPaid ? paid : [], {
        id: "paid",
        x: "key",
        y: "usd",
        stroke: GOLD,
        strokeWidth: 1.25,
        strokeDasharray: "3 4",
      }),
    ],
    scales: {
      x: {
        scale: scaleBand<string>().domain(keys).paddingInner(keys.length > 45 ? 0.18 : 0.3),
        axis: {
          line: false,
          ticks: { size: 0, values: spacedTicks(keys, narrow ? 5 : summary.hourly ? 12 : 10), format: label },
          tickLabels: { fontSize: 11 },
        },
      },
      y: {
        scale: empty ? scaleLinear().domain([0, 1]) : scaleLinear,
        nice: !empty,
        grid: quietGrid,
        axis: {
          line: false,
          ticks: empty ? { size: 0, values: [0], format: metricTick[metric] } : { size: 0, count: 4, format: metricTick[metric] },
          tickLabels: { fontSize: 11 },
        },
      },
    },
    color: providerColorScale,
    focus: "group-x",
    tooltip: {
      use: tooltip,
      className: tooltipClass,
      content(points) {
        const first = points[0]?.datum;
        const key = first && "key" in first ? first.key : "";
        const usage = points.flatMap((point) => ("provider" in point.datum ? [point.datum] : []));
        const paidPoint = points.flatMap((point) => ("usd" in point.datum ? [point.datum] : []))[0];
        const total = usage.reduce((sum, row) => sum + row.value, 0);
        return {
          title: heading(key),
          rows: [
            ...[...usage]
              .sort((a, b) => PROVIDERS.indexOf(a.provider) - PROVIDERS.indexOf(b.provider))
              .map((row) => ({ label: row.label, value: format(row.value), color: providerColor[row.provider] })),
            ...(usage.length > 1 ? [{ label: "Total", value: format(total), active: true }] : []),
            ...(paidPoint ? [{ label: "Paid", value: usd(paidPoint.usd), color: GOLD }] : []),
          ],
        };
      },
    },
  });
}

export type MixPart = "Input" | "Output" | "Cache read" | "Cache write";

export const mixColor: Record<MixPart, string> = {
  Input: "#ece9e2",
  Output: GOLD,
  "Cache read": "#5d5a55",
  "Cache write": "#9a958c",
};

const mixOrder: MixPart[] = ["Input", "Output", "Cache write", "Cache read"];

export function mixChart(totals: Summary["totals"]) {
  const tokenTotal = totals.tokens || 1;
  const usdTotal = totals.usd || 1;
  const parts: { part: MixPart; tokens: number; usd: number }[] = [
    { part: "Input", tokens: totals.input, usd: totals.usdInput },
    { part: "Output", tokens: totals.output, usd: totals.usdOutput },
    { part: "Cache write", tokens: totals.cacheWrite, usd: totals.usdCacheWrite },
    { part: "Cache read", tokens: totals.cacheRead, usd: totals.usdCacheRead },
  ];
  const rows = parts.flatMap((entry) => [
    { measure: "Tokens", part: entry.part, share: entry.tokens / tokenTotal, detail: tokens(entry.tokens) },
    { measure: "Cost", part: entry.part, share: entry.usd / usdTotal, detail: usd(entry.usd) },
  ]);

  return defineChart({
    marks: [
      barX(rows, {
        x: "share",
        y: "measure",
        z: "part",
        color: "part",
        key: (row) => `${row.measure}:${row.part}`,
        layout: stack({ order: mixOrder }),
        inset: 0,
      }),
    ],
    scales: {
      x: { scale: scaleLinear().domain([0, 1]), axis: false },
      y: {
        scale: scaleBand<string>().domain(["Tokens", "Cost"]).paddingInner(0.42).paddingOuter(0.1),
        axis: { line: false, ticks: { size: 0 }, tickLabels: { fontSize: 11 } },
      },
    },
    color: { domain: mixOrder, range: mixOrder.map((part) => mixColor[part]) },
    margin: { right: 0, top: 0, bottom: 0 },
    tooltip: {
      use: tooltip,
      className: tooltipClass,
      content(points) {
        const row = points[0]?.datum;
        if (!row) return { rows: [] };
        return {
          title: `${row.part} · share of ${row.measure.toLowerCase()}`,
          rows: [{ label: pct(row.share, 1), value: row.detail, color: mixColor[row.part] }],
        };
      },
    },
  });
}

export function modelsChart(models: Summary["models"], labels: Map<string, string>) {
  const rows = models
    .filter((model) => model.price && model.usd > 0)
    .slice(0, 8)
    .map((model) => {
      const id = `${model.provider}:${model.model}`;
      return { id, model: labels.get(id) ?? model.model, provider: model.provider as Provider, usd: model.usd };
    });
  return defineChart({
    marks: [
      barX(rows, {
        x: "usd",
        y: "model",
        color: "provider",
        key: "id",
        radius: { end: 2 },
        maxThickness: 14,
      }),
    ],
    scales: {
      x: {
        scale: scaleLinear,
        nice: true,
        grid: quietGrid,
        axis: { line: false, ticks: { size: 0, count: 4, format: usdTick }, tickLabels: { fontSize: 11 } },
      },
      y: {
        scale: scaleBand<string>().domain(rows.map((row) => row.model)).paddingInner(0.35),
        axis: { line: false, ticks: { size: 0 }, tickLabels: { fontSize: 11 } },
      },
    },
    color: providerColorScale,
    tooltip: {
      use: tooltip,
      className: tooltipClass,
      content(points) {
        const row = points[0]?.datum;
        if (!row) return { rows: [] };
        return {
          title: row.model,
          rows: [{ label: providerLabel[row.provider], value: usd(row.usd), color: providerColor[row.provider] }],
        };
      },
    },
  });
}

const heatLevels = ["0", "1", "2", "3", "4"] as const;
const heatRange = [
  "rgba(236,233,226,0.045)",
  "rgba(217,180,106,0.26)",
  "rgba(217,180,106,0.48)",
  "rgba(217,180,106,0.72)",
  "rgba(232,198,128,1)",
];

export function rhythmChart(heat: Summary["heat"]) {
  const max = Math.max(1, ...heat.map((cellRow) => cellRow.events));
  const rows = heat.map((entry) => ({
    ...entry,
    day: WEEKDAYS[entry.weekday],
    slot: String(entry.hour),
    level: entry.events === 0 ? "0" : String(Math.min(4, Math.ceil((entry.events / max) * 4))),
  }));
  const hours = Array.from({ length: 24 }, (_, hour) => String(hour));
  return defineChart({
    marks: [
      cell(rows, {
        x: "slot",
        y: "day",
        color: "level",
        key: (row) => `${row.weekday}:${row.hour}`,
        inset: 1.5,
        radius: 2,
      }),
    ],
    scales: {
      x: {
        scale: scaleBand<string>().domain(hours),
        axis: {
          line: false,
          ticks: { size: 0, values: ["0", "6", "12", "18"], format: (value) => hourLabel(Number(value)) },
          tickLabels: { fontSize: 11 },
        },
      },
      y: {
        scale: scaleBand<string>().domain(WEEKDAYS),
        axis: { line: false, ticks: { size: 0 }, tickLabels: { fontSize: 11 } },
      },
    },
    color: { domain: [...heatLevels], range: heatRange },
    tooltip: {
      use: tooltip,
      className: tooltipClass,
      content(points) {
        const row = points[0]?.datum;
        if (!row) return { rows: [] };
        return {
          title: `${row.day} · ${hourLabel(row.hour)}–${hourLabel((row.hour + 1) % 24)}`,
          rows: [{ label: "Responses", value: count(row.events) }],
        };
      },
    },
  });
}
