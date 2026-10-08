// Dev-only synthetic ledger for `?demo`. Shapes follow what the sync parsers
// emit: Claude Code turns reread large cached prompts, Codex reports reasoning
// inside output, and the Cursor hook started recently with one unpriced model.
import { localDateString } from "../../shared/subscriptions.mjs";
import type { Provider } from "../../shared/metrics.mjs";
import { HISTORY_DAYS, type PlanRow, type Snapshot } from "./data";

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

type Turn = { input: number; output: number; cacheRead: number; cacheWrite: number; reasoning: number; partial: boolean };
type Profile = {
  provider: Provider;
  models: readonly (readonly [string, number])[];
  firstDay: number;
  dailyChance: number;
  weekendFactor: number;
  turnsPerHour: readonly [number, number];
  turn: (random: () => number, model: string) => Turn;
};

const between = (random: () => number, low: number, high: number) => Math.round(low + random() * (high - low));

const profiles: readonly Profile[] = [
  {
    provider: "anthropic",
    models: [["claude-opus-4-5-20251101", 0.62], ["claude-sonnet-4-5-20250929", 0.3], ["claude-haiku-4-5-20251001", 0.08]],
    firstDay: 0,
    dailyChance: 0.86,
    weekendFactor: 0.55,
    turnsPerHour: [6, 34],
    turn: (random) => ({
      input: between(random, 4, 900),
      output: between(random, 120, 2400),
      cacheRead: between(random, 28_000, 140_000),
      cacheWrite: random() < 0.3 ? between(random, 2_000, 24_000) : between(random, 0, 1_500),
      reasoning: 0,
      partial: false,
    }),
  },
  {
    provider: "openai",
    models: [["gpt-5.3-codex", 1]],
    firstDay: 62,
    dailyChance: 0.7,
    weekendFactor: 0.8,
    turnsPerHour: [3, 18],
    turn: (random) => {
      const output = between(random, 300, 4200);
      return {
        input: between(random, 1_200, 9_000),
        output,
        cacheRead: between(random, 12_000, 96_000),
        cacheWrite: 0,
        reasoning: Math.round(output * (0.3 + random() * 0.35)),
        partial: false,
      };
    },
  },
  {
    provider: "cursor",
    models: [["claude-sonnet-4-5", 0.55], ["composer-1", 0.45]],
    firstDay: 80,
    dailyChance: 0.75,
    weekendFactor: 0.4,
    turnsPerHour: [2, 12],
    turn: (random) => {
      const partial = random() < 0.2;
      return {
        input: between(random, 2_000, 16_000),
        output: between(random, 200, 1_800),
        cacheRead: partial ? 0 : between(random, 8_000, 60_000),
        cacheWrite: partial ? 0 : between(random, 0, 4_000),
        reasoning: 0,
        partial,
      };
    },
  },
];

// Relative activity per local hour: late mornings, afternoons, and long evenings.
const hourWeight = [
  0.45, 0.25, 0.08, 0, 0, 0, 0, 0.02, 0.08, 0.25, 0.6, 0.75, 0.55, 0.35, 0.55, 0.8, 0.85, 0.7, 0.45, 0.5,
  0.75, 0.95, 1, 0.8,
];

function pick(random: () => number, models: Profile["models"]) {
  let roll = random();
  for (const [model, weight] of models) {
    roll -= weight;
    if (roll <= 0) return model;
  }
  return models[models.length - 1][0];
}

export function demoSnapshot(): Snapshot {
  const random = mulberry32(2304);
  const now = new Date();
  const buckets: unknown[] = [];
  let latest: string | null = null;

  for (let offset = HISTORY_DAYS - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const dayIndex = HISTORY_DAYS - 1 - offset;
    const day = localDateString(date);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const intensity = 0.6 + random() * 0.8;

    for (const profile of profiles) {
      if (dayIndex < profile.firstDay) continue;
      const chance = profile.dailyChance * (weekend ? profile.weekendFactor : 1);
      if (random() > chance) continue;
      const lastHour = offset === 0 ? now.getHours() : 23;

      for (let hour = 0; hour <= lastHour; hour += 1) {
        if (random() > hourWeight[hour] * intensity) continue;
        const turns = between(random, profile.turnsPerHour[0], profile.turnsPerHour[1]);
        const perModel = new Map<string, number[]>();
        for (let index = 0; index < turns; index += 1) {
          const model = pick(random, profile.models);
          const turn = profile.turn(random, model);
          const total = perModel.get(model) ?? [0, 0, 0, 0, 0, 0, 0];
          total[0] += 1;
          total[1] += turn.input;
          total[2] += turn.output;
          total[3] += turn.cacheRead;
          total[4] += turn.cacheWrite;
          total[5] += turn.reasoning;
          total[6] += turn.partial ? 1 : 0;
          perModel.set(model, total);
        }
        const localHour = `${day}T${String(hour).padStart(2, "0")}`;
        for (const [model, total] of perModel) {
          buckets.push([localHour, profile.provider, model, ...total]);
        }
        const stamp = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, between(random, 0, 59));
        if (stamp <= now && (!latest || stamp.toISOString() > latest)) latest = stamp.toISOString();
      }
    }
  }

  const year = now.getFullYear();
  const plans: PlanRow[] = [
    { id: "demo-claude", provider: "anthropic", label: "Claude Pro (annual)", amount_cents: 20_400, cadence: "annual", starts_on: `${year - 1}-11-01`, ends_on: null },
    { id: "demo-chatgpt", provider: "openai", label: "ChatGPT Pro (student promo)", amount_cents: 0, cadence: "monthly", starts_on: localDateString(new Date(year, now.getMonth() - 1, 1)), ends_on: localDateString(new Date(year, now.getMonth() + 3, 0)) },
    { id: "demo-cursor", provider: "cursor", label: "Cursor (annual)", amount_cents: 19_200, cadence: "annual", starts_on: `${year}-03-01`, ends_on: null },
  ];

  return { buckets, latest, plans, fetchedAt: Date.now(), today: localDateString(now) };
}
