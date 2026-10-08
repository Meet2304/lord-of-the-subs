import assert from "node:assert/strict";
import test from "node:test";
import { blendedPrice, dateRange, parseBuckets, summarize } from "./metrics.mjs";

const raw = [
  // claude-sonnet-4-5: input 3, output 15, cacheRead 0.3, cacheWrite 3.75 per 1M
  ["2026-10-06T09", "anthropic", "claude-sonnet-4-5-20250929", 4, 1_000_000, 100_000, 10_000_000, 200_000, 0, 0],
  // gpt-5.3-codex: input 1.75, output 14, cacheRead 0.175
  ["2026-10-07T22", "openai", "gpt-5.3-codex", 2, 500_000, 200_000, 2_000_000, 0, 50_000, 0],
  ["2026-10-07T23", "cursor", "mystery-model", 1, 1_000, 1_000, 0, 0, 0, 1],
  ["bad"],
  ["2026-10-07T23", "google", "gemini", 1, 1, 1, 1, 1, 0, 0],
];

const plans = [
  { provider: "anthropic", amount_cents: 36_500, cadence: "annual", starts_on: "2026-01-01", ends_on: null },
  { provider: "openai", amount_cents: 0, cadence: "monthly", starts_on: "2026-09-01", ends_on: "2026-12-31" },
];

test("parseBuckets keeps known providers and splits the local hour", () => {
  const buckets = parseBuckets(raw);
  assert.equal(buckets.length, 3);
  assert.deepEqual(
    { day: buckets[0].day, hour: buckets[0].hour, cacheWrite: buckets[0].cacheWrite },
    { day: "2026-10-06", hour: 9, cacheWrite: 200_000 },
  );
  assert.deepEqual(parseBuckets(null), []);
});

test("dateRange is inclusive and crosses month ends", () => {
  assert.deepEqual(dateRange("2026-10-02", 3), ["2026-09-30", "2026-10-01", "2026-10-02"]);
});

test("summarize prices tokens, prorates plans, and reports efficiency", () => {
  const summary = summarize({ buckets: parseBuckets(raw), plans, endDate: "2026-10-07", days: 7 });
  const claude = 3 + 1.5 + 3 + 0.75;
  const codex = 0.875 + 2.8 + 0.35;
  assert.ok(Math.abs(summary.totals.usd - (claude + codex)) < 1e-9);
  // $365/yr annual plan over 7 days, free Codex promo.
  assert.ok(Math.abs(summary.totals.paidUsd - 7) < 1e-9);
  assert.ok(Math.abs(summary.totals.leverage - (claude + codex) / 7) < 1e-9);
  assert.equal(summary.totals.unpricedTokens, 2_000);
  assert.equal(summary.totals.partial, 1);
  assert.equal(summary.totals.events, 7);
  assert.equal(summary.totals.activeDays, 2);
  assert.equal(summary.totals.activeHours, 3);
  assert.equal(summary.totals.longestStreak, 2);
  // Cache hit rate: reads / (input + reads + writes)
  const inputSide = 1_000_000 + 10_000_000 + 200_000 + 500_000 + 2_000_000 + 1_000;
  assert.ok(Math.abs(summary.totals.cacheHitRate - 12_000_000 / inputSide) < 1e-12);
  // Cache savings: reads priced at full input minus the cached rate.
  assert.ok(Math.abs(summary.totals.cacheSavingsUsd - (10 * 2.7 + 2 * 1.575)) < 1e-9);
  // Reasoning share only counts Codex output.
  assert.equal(summary.totals.reasoningShare, 0.25);

  const openai = summary.providers.find((row) => row.provider === "openai");
  assert.equal(openai?.paidUsd, 0);
  assert.equal(openai?.leverage, null);
  assert.equal(summary.models[0].model, "claude-sonnet-4-5-20250929");
  assert.equal(summary.models.at(-1)?.price, null);

  assert.equal(summary.series.keys.length, 7);
  assert.equal(summary.series.paid.length, 7);
  // 2026-10-06 is a Tuesday (weekday 1 with Monday first).
  assert.equal(summary.heat[1 * 24 + 9].events, 4);
  assert.deepEqual(summary.peak, { weekday: 1, hour: 9, events: 4 });
});

test("summarize filters by provider and switches to hours for one day", () => {
  const summary = summarize({
    buckets: parseBuckets(raw),
    plans,
    endDate: "2026-10-07",
    days: 1,
    provider: "openai",
  });
  assert.equal(summary.hourly, true);
  assert.equal(summary.series.keys.length, 24);
  assert.equal(summary.totals.events, 2);
  assert.equal(summary.providers.length, 1);
  assert.equal(summary.totals.paidUsd, 0);
});

test("blendedPrice follows the 3:1 input to output convention", () => {
  assert.equal(blendedPrice({ input: 3, output: 15 }), 6);
});
