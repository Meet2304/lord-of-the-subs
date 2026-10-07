import path from "node:path";

function num(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed);
}

function threadId(fileId) {
  const base = path.basename(fileId, ".jsonl");
  const match = base.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
  );
  return match ? match[1] : base;
}

/**
 * Codex rollout files store a cumulative total and a per-turn last_token_usage.
 * Only the last turn is recorded, so sessions are not double-counted.
 *
 * @param {string} text
 * @param {string} fileId
 */
export function parseCodexJsonl(text, fileId) {
  /** @type {Array<Record<string, unknown>>} */
  const events = [];
  let model = "unknown";
  const lines = text.split("\n");
  const id = threadId(fileId);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }

    const payload = row?.payload;
    const nextModel = payload?.model || payload?.info?.model;
    if (typeof nextModel === "string" && nextModel) model = nextModel;

    if (row?.type !== "event_msg" || payload?.type !== "token_count") continue;
    const last = payload.info?.last_token_usage;
    if (!last || typeof last !== "object") continue;

    const rawInput = num(last.input_tokens);
    const cacheRead = num(last.cached_input_tokens);
    const cacheWrite = num(last.cache_write_input_tokens);
    const output = num(last.output_tokens);
    const reasoning = num(last.reasoning_output_tokens);
    const input = Math.max(0, rawInput - cacheRead);
    if (input + output + cacheRead + cacheWrite === 0) continue;

    const occurredAt = row.timestamp ? new Date(row.timestamp) : null;
    if (!occurredAt || Number.isNaN(occurredAt.getTime())) continue;

    events.push({
      external_id: `codex:${id}:${index}`,
      provider: "openai",
      surface: "codex",
      model,
      occurred_at: occurredAt.toISOString(),
      input_tokens: input,
      output_tokens: output,
      cache_read_tokens: cacheRead,
      cache_write_tokens: cacheWrite,
      reasoning_tokens: reasoning,
      source: "codex_transcript",
      confidence: "exact",
    });
  }
  return events;
}
