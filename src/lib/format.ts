import type { Provider } from "../../shared/metrics.mjs";

export const providerLabel: Record<Provider, string> = {
  anthropic: "Claude",
  openai: "OpenAI",
  cursor: "Cursor",
};

export const providerSurface: Record<Provider, string> = {
  anthropic: "Claude Code",
  openai: "Codex CLI",
  cursor: "Cursor agent",
};

export const providerColor: Record<Provider, string> = {
  anthropic: "#e38b68",
  openai: "#86cfae",
  cursor: "#94a6f2",
};

export const GOLD = "#d9b46a";

export function shortModel(model: string): string {
  return model.replace(/-\d{8}$/, "");
}

/** Short model names, with the surface added where two providers share one. */
export function modelLabels(models: readonly { provider: Provider; model: string }[]) {
  const counts = new Map<string, number>();
  for (const row of models) counts.set(shortModel(row.model), (counts.get(shortModel(row.model)) ?? 0) + 1);
  const labels = new Map<string, string>();
  for (const row of models) {
    const name = shortModel(row.model);
    labels.set(`${row.provider}:${row.model}`, (counts.get(name) ?? 0) > 1 ? `${name} · ${providerLabel[row.provider]}` : name);
  }
  return labels;
}

const usdWhole = new Intl.NumberFormat("en", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdCents = new Intl.NumberFormat("en", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdCompact = new Intl.NumberFormat("en", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

export function usd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 100_000) return usdCompact.format(value);
  if (abs >= 100) return usdWhole.format(value);
  return usdCents.format(value);
}

export function usdTick(value: number): string {
  if (value === 0) return "$0";
  if (Math.abs(value) >= 1000) return usdCompact.format(value);
  return Number.isInteger(value) ? `$${whole.format(value)}` : `$${value.toFixed(2)}`;
}

export function perM(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value >= 10 ? `$${value.toFixed(1)}` : `$${value.toFixed(2)}`;
}

export function tokens(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return compact.format(value);
}

export function count(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value >= 10_000 ? compact.format(value) : whole.format(value);
}

export function pct(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function times(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value >= 100 ? `${whole.format(value)}×` : `${value.toFixed(1)}×`;
}

const dayLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const weekdayLabel = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" });

function parseDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

export function shortDay(day: string): string {
  return dayLabel.format(parseDay(day));
}

export function longDay(day: string): string {
  return weekdayLabel.format(parseDay(day));
}

export function hourLabel(hour: number): string {
  if (hour === 0) return "12a";
  if (hour === 12) return "12p";
  return hour < 12 ? `${hour}a` : `${hour - 12}p`;
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
