// Standard short-context list prices, USD per 1M tokens.
// Claude cache writes use the 5-minute cache rate. 1-hour cache writes cost more.
// OpenAI long-context and fast mode cost more than these rows.
// Sources checked 2026-10-02: Anthropic pricing docs, OpenAI API pricing.
// A model that is not listed stays unpriced. The dashboard shows those tokens
// and leaves them out of the dollar total.

/** @type {Record<string, { input: number, output: number, cacheRead: number, cacheWrite: number }>} */
export const PRICES = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  "claude-fable-5": { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-7": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-6": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-1": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  "claude-opus-4": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-sonnet-4-5": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-sonnet-4": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "claude-haiku-3-5": { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
  "gpt-5.3-codex": { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 },
  "gpt-5.6-sol": { input: 4, output: 20, cacheRead: 0.4, cacheWrite: 5 },
  "gpt-6-astra": { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  "gpt-6.1-sol": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "gpt-6-luna": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

const KEYS = Object.keys(PRICES).sort((a, b) => b.length - a.length);

/**
 * @param {string} model
 * @returns {{ input: number, output: number, cacheRead: number, cacheWrite: number } | null}
 */
export function priceFor(model) {
  const id = String(model || "").toLowerCase();
  for (const key of KEYS) {
    if (id === key || id.startsWith(`${key}-`) || id.startsWith(`${key}.`)) {
      return PRICES[key];
    }
  }
  return null;
}

/**
 * @param {{ model: string, input_tokens?: number, output_tokens?: number, cache_read_tokens?: number, cache_write_tokens?: number }} event
 * @returns {number | null}
 */
export function eventCostUsd(event) {
  const price = priceFor(event.model);
  if (!price) return null;
  const input = Number(event.input_tokens) || 0;
  const output = Number(event.output_tokens) || 0;
  const cacheRead = Number(event.cache_read_tokens) || 0;
  const cacheWrite = Number(event.cache_write_tokens) || 0;
  return (
    (input * price.input +
      output * price.output +
      cacheRead * price.cacheRead +
      cacheWrite * price.cacheWrite) /
    1_000_000
  );
}
