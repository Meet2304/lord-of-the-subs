import { priceFor } from "./prices.mjs";
import { localDateString, subscriptionCostUsd } from "./subscriptions.mjs";

/** @typedef {"anthropic" | "openai" | "cursor"} Provider */

/**
 * @typedef {{
 *   day: string,
 *   hour: number,
 *   provider: Provider,
 *   model: string,
 *   events: number,
 *   input: number,
 *   output: number,
 *   cacheRead: number,
 *   cacheWrite: number,
 *   reasoning: number,
 *   partial: number,
 * }} Bucket
 */

/**
 * @typedef {{
 *   provider: Provider,
 *   amount_cents: number,
 *   cadence: "monthly" | "annual",
 *   starts_on: string,
 *   ends_on: string | null,
 * }} Plan
 */

/** @type {readonly Provider[]} */
export const PROVIDERS = ["anthropic", "openai", "cursor"];

/**
 * Rows from public.usage_buckets: [local_hour, provider, model, events,
 * input, output, cache_read, cache_write, reasoning, partial_events].
 *
 * @param {unknown} raw
 * @returns {Bucket[]}
 */
export function parseBuckets(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {Bucket[]} */
  const buckets = [];
  for (const row of raw) {
    if (!Array.isArray(row) || typeof row[0] !== "string") continue;
    const provider = row[1];
    if (!PROVIDERS.includes(provider)) continue;
    buckets.push({
      day: row[0].slice(0, 10),
      hour: Number(row[0].slice(11, 13)) || 0,
      provider,
      model: String(row[2] ?? "unknown"),
      events: Number(row[3]) || 0,
      input: Number(row[4]) || 0,
      output: Number(row[5]) || 0,
      cacheRead: Number(row[6]) || 0,
      cacheWrite: Number(row[7]) || 0,
      reasoning: Number(row[8]) || 0,
      partial: Number(row[9]) || 0,
    });
  }
  return buckets;
}

/**
 * Inclusive list of local dates ending on `endDate`.
 * @param {string} endDate
 * @param {number} count
 */
export function dateRange(endDate, count) {
  const [year, month, day] = endDate.split("-").map(Number);
  const days = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    days.push(localDateString(new Date(year, month - 1, day - offset)));
  }
  return days;
}

function emptyTotals() {
  return {
    events: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
    reasoningTrackedOutput: 0,
    partial: 0,
    usd: 0,
    usdInput: 0,
    usdOutput: 0,
    usdCacheRead: 0,
    usdCacheWrite: 0,
    cacheSavingsUsd: 0,
    unpricedTokens: 0,
    unpricedEvents: 0,
  };
}

/** @typedef {ReturnType<typeof emptyTotals>} Totals */

/**
 * @param {Totals} totals
 * @param {Bucket} bucket
 */
function add(totals, bucket) {
  totals.events += bucket.events;
  totals.input += bucket.input;
  totals.output += bucket.output;
  totals.cacheRead += bucket.cacheRead;
  totals.cacheWrite += bucket.cacheWrite;
  totals.partial += bucket.partial;
  // Only Codex reports reasoning separately; Claude and Cursor fold it into output.
  if (bucket.provider === "openai") {
    totals.reasoning += bucket.reasoning;
    totals.reasoningTrackedOutput += bucket.output;
  }
  const price = priceFor(bucket.model);
  if (!price) {
    totals.unpricedTokens += bucket.input + bucket.output + bucket.cacheRead + bucket.cacheWrite;
    totals.unpricedEvents += bucket.events;
    return;
  }
  const input = (bucket.input * price.input) / 1e6;
  const output = (bucket.output * price.output) / 1e6;
  const cacheRead = (bucket.cacheRead * price.cacheRead) / 1e6;
  const cacheWrite = (bucket.cacheWrite * price.cacheWrite) / 1e6;
  totals.usdInput += input;
  totals.usdOutput += output;
  totals.usdCacheRead += cacheRead;
  totals.usdCacheWrite += cacheWrite;
  totals.usd += input + output + cacheRead + cacheWrite;
  totals.cacheSavingsUsd += (bucket.cacheRead * Math.max(0, price.input - price.cacheRead)) / 1e6;
}

/** @param {Totals} totals */
function derive(totals) {
  const tokens = totals.input + totals.output + totals.cacheRead + totals.cacheWrite;
  const inputSide = totals.input + totals.cacheRead + totals.cacheWrite;
  const pricedTokens = tokens - totals.unpricedTokens;
  return {
    ...totals,
    tokens,
    fresh: totals.input + totals.output,
    cached: totals.cacheRead + totals.cacheWrite,
    /** Share of input-side tokens served from cache. */
    cacheHitRate: inputSide > 0 ? totals.cacheRead / inputSide : null,
    outputPerResponse: totals.events > 0 ? totals.output / totals.events : null,
    tokensPerResponse: totals.events > 0 ? tokens / totals.events : null,
    /** API-equivalent dollars per million tokens actually processed. */
    effectivePerM: pricedTokens > 0 ? (totals.usd / pricedTokens) * 1e6 : null,
    reasoningShare:
      totals.reasoningTrackedOutput > 0 ? totals.reasoning / totals.reasoningTrackedOutput : null,
  };
}

/** @typedef {ReturnType<typeof derive>} Metrics */

/**
 * Artificial Analysis blends list prices 3:1 input to output.
 * @param {{ input: number, output: number }} price
 */
export function blendedPrice(price) {
  return (3 * price.input + price.output) / 4;
}

/**
 * @param {readonly string[]} days
 * @param {Set<string>} active
 */
function streaks(days, active) {
  let longest = 0;
  let run = 0;
  for (const day of days) {
    run = active.has(day) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return { longest, current: run };
}

/**
 * @param {{
 *   buckets: readonly Bucket[],
 *   plans: readonly Plan[],
 *   endDate: string,
 *   days: number,
 *   provider?: Provider | "all",
 * }} options
 */
export function summarize({ buckets, plans, endDate, days, provider = "all" }) {
  const windowDays = dateRange(endDate, days);
  const startDate = windowDays[0];
  const hourly = days === 1;
  const inWindow = buckets.filter(
    (bucket) =>
      bucket.day >= startDate &&
      bucket.day <= endDate &&
      (provider === "all" || bucket.provider === provider),
  );
  const visiblePlans = plans.filter((plan) => provider === "all" || plan.provider === provider);

  const totals = emptyTotals();
  /** @type {Map<Provider, Totals>} */
  const byProvider = new Map(PROVIDERS.map((name) => [name, emptyTotals()]));
  /** @type {Map<string, { provider: Provider, model: string, totals: Totals }>} */
  const byModel = new Map();
  /** @type {Map<string, { key: string, provider: Provider, usd: number, tokens: number, events: number }>} */
  const seriesMap = new Map();
  const heat = Array.from({ length: 7 * 24 }, () => 0);
  const activeDays = new Set();
  const activeHours = new Set();

  for (const bucket of inWindow) {
    add(totals, bucket);
    const providerTotals = byProvider.get(bucket.provider);
    if (providerTotals) add(providerTotals, bucket);

    const modelKey = `${bucket.provider}\u0000${bucket.model}`;
    let model = byModel.get(modelKey);
    if (!model) {
      model = { provider: bucket.provider, model: bucket.model, totals: emptyTotals() };
      byModel.set(modelKey, model);
    }
    add(model.totals, bucket);

    const key = hourly ? String(bucket.hour).padStart(2, "0") : bucket.day;
    const seriesKey = `${key}\u0000${bucket.provider}`;
    let point = seriesMap.get(seriesKey);
    if (!point) {
      point = { key, provider: bucket.provider, usd: 0, tokens: 0, events: 0 };
      seriesMap.set(seriesKey, point);
    }
    const one = emptyTotals();
    add(one, bucket);
    point.usd += one.usd;
    point.tokens += bucket.input + bucket.output + bucket.cacheRead + bucket.cacheWrite;
    point.events += bucket.events;

    if (bucket.events > 0) {
      activeDays.add(bucket.day);
      activeHours.add(`${bucket.day}T${bucket.hour}`);
      const [year, month, date] = bucket.day.split("-").map(Number);
      const weekday = (new Date(year, month - 1, date).getDay() + 6) % 7;
      heat[weekday * 24 + bucket.hour] += bucket.events;
    }
  }

  const paidUsd = subscriptionCostUsd(visiblePlans, startDate, endDate);
  const keys = hourly
    ? Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"))
    : windowDays;
  const paidSeries = hourly
    ? keys.map((key) => ({ key, usd: paidUsd / 24 }))
    : windowDays.map((day) => ({ key: day, usd: subscriptionCostUsd(visiblePlans, day, day) }));

  const metrics = derive(totals);
  const streak = streaks(windowDays, activeDays);
  let peakCell = -1;
  for (let index = 0; index < heat.length; index += 1) {
    if (heat[index] > 0 && (peakCell === -1 || heat[index] > heat[peakCell])) peakCell = index;
  }

  return {
    startDate,
    endDate,
    days,
    hourly,
    totals: {
      ...metrics,
      paidUsd,
      leverage: paidUsd > 0 ? metrics.usd / paidUsd : null,
      activeDays: activeDays.size,
      activeHours: activeHours.size,
      usdPerActiveDay: activeDays.size > 0 ? metrics.usd / activeDays.size : null,
      eventsPerActiveDay: activeDays.size > 0 ? metrics.events / activeDays.size : null,
      longestStreak: streak.longest,
      currentStreak: streak.current,
    },
    providers: PROVIDERS.filter((name) => provider === "all" || name === provider).map((name) => {
      const value = derive(byProvider.get(name) ?? emptyTotals());
      const paid = subscriptionCostUsd(
        plans.filter((plan) => plan.provider === name),
        startDate,
        endDate,
      );
      return {
        provider: name,
        ...value,
        paidUsd: paid,
        hasPlan: plans.some((plan) => plan.provider === name),
        leverage: paid > 0 ? value.usd / paid : null,
      };
    }),
    models: [...byModel.values()]
      .map(({ provider: modelProvider, model, totals: modelTotals }) => {
        const price = priceFor(model);
        return {
          provider: modelProvider,
          model,
          price,
          blendedPrice: price ? blendedPrice(price) : null,
          ...derive(modelTotals),
        };
      })
      .sort((a, b) => b.usd - a.usd || b.tokens - a.tokens),
    series: { keys, rows: [...seriesMap.values()], paid: paidSeries },
    heat: heat.map((events, index) => ({
      weekday: Math.floor(index / 24),
      hour: index % 24,
      events,
    })),
    peak:
      peakCell === -1
        ? null
        : { weekday: Math.floor(peakCell / 24), hour: peakCell % 24, events: heat[peakCell] },
  };
}

/** @typedef {ReturnType<typeof summarize>} Summary */
