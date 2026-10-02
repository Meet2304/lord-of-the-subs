import test from "node:test";
import assert from "node:assert/strict";
import { parseClaudeJsonl } from "./parse-claude.mjs";
import { parseCodexJsonl } from "./parse-codex.mjs";
import { parseCursorSpool } from "./parse-cursor.mjs";
import { eventCostUsd, priceFor } from "../shared/prices.mjs";
import { subscriptionCostUsd } from "../shared/subscriptions.mjs";

test("claude parser keeps provider usage and ignores other rows", () => {
  const text = [
    JSON.stringify({ type: "user", uuid: "u1", message: { content: "secret prompt" } }),
    JSON.stringify({
      type: "assistant",
      uuid: "a1",
      timestamp: "2026-10-02T12:00:00.000Z",
      message: {
        model: "claude-sonnet-4-6",
        usage: {
          input_tokens: 100,
          output_tokens: 40,
          cache_read_input_tokens: 25,
          cache_creation_input_tokens: 10,
        },
      },
    }),
  ].join("\n");

  const events = parseClaudeJsonl(text, "session.jsonl");
  assert.equal(events.length, 1);
  assert.equal(events[0].external_id, "claude:a1");
  assert.equal(events[0].provider, "anthropic");
  assert.equal(events[0].input_tokens, 100);
  assert.equal(events[0].cache_read_tokens, 25);
  assert.equal(events[0].cache_write_tokens, 10);
  assert.equal(JSON.stringify(events[0]).includes("secret"), false);
});

test("codex parser uses the per-turn count, not the session total", () => {
  const text = [
    JSON.stringify({
      timestamp: "2026-10-02T12:00:00.000Z",
      type: "session_meta",
      payload: { model: "gpt-5.3-codex" },
    }),
    JSON.stringify({
      timestamp: "2026-10-02T12:01:00.000Z",
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: { input_tokens: 5000, output_tokens: 800, total_tokens: 5800 },
          last_token_usage: {
            input_tokens: 70,
            cached_input_tokens: 10,
            output_tokens: 20,
            reasoning_output_tokens: 5,
          },
        },
      },
    }),
  ].join("\n");

  const events = parseCodexJsonl(text, "rollout-2026-10-02T12-00-00-11111111-2222-4333-8444-555555555555.jsonl");
  assert.equal(events.length, 1);
  assert.equal(events[0].model, "gpt-5.3-codex");
  assert.equal(events[0].input_tokens, 60);
  assert.equal(events[0].cache_read_tokens, 10);
  assert.equal(events[0].output_tokens, 20);
  assert.equal(events[0].provider, "openai");
});

test("cursor spool splits inclusive input and drops empty hooks", () => {
  const text = [
    JSON.stringify({
      generation_id: "g1",
      model: "claude-opus-4-6",
      input_tokens: 1000,
      output_tokens: 50,
      cache_read_tokens: 800,
      cache_write_tokens: 100,
      occurred_at: "2026-10-02T12:00:00.000Z",
    }),
    JSON.stringify({
      generation_id: "g2",
      model: "composer-2.5",
      input_tokens: null,
      output_tokens: null,
      occurred_at: "2026-10-02T12:05:00.000Z",
    }),
  ].join("\n");

  const events = parseCursorSpool(text);
  assert.equal(events.length, 1);
  assert.equal(events[0].input_tokens, 100);
  assert.equal(events[0].cache_read_tokens, 800);
  assert.equal(events[0].cache_write_tokens, 100);
  assert.equal(events[0].confidence, "exact");
});

test("price match prefers the longer model id", () => {
  assert.equal(priceFor("claude-opus-4-6")?.output, 25);
  assert.equal(priceFor("claude-opus-4-6-20260201")?.input, 5);
  assert.equal(priceFor("gpt-5.3-codex")?.output, 14);
  assert.equal(priceFor("composer-2.5"), null);
  const cost = eventCostUsd({
    model: "claude-sonnet-4-6",
    input_tokens: 1_000_000,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
  });
  assert.equal(cost, 3);
});

test("subscription cost spreads an annual plan across the window", () => {
  const cost = subscriptionCostUsd(
    [
      {
        amount_cents: 36500,
        cadence: "annual",
        starts_on: "2026-01-01",
        ends_on: null,
      },
    ],
    "2026-10-01",
    "2026-10-01",
  );
  assert.ok(Math.abs(cost - 1) < 0.001);
});
