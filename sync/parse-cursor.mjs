function num(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed);
}

/**
 * One JSON object per line, written by sync/cursor-hook.mjs.
 * Cursor's hook reports input_tokens inclusive of cache reads and writes.
 *
 * @param {string} text
 */
export function parseCursorSpool(text) {
  /** @type {Array<Record<string, unknown>>} */
  const events = [];
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }

    const rawInput = num(row.input_tokens);
    const output = num(row.output_tokens);
    const cacheRead = num(row.cache_read_tokens);
    const cacheWrite = num(row.cache_write_tokens);
    const hasCache =
      row.cache_read_tokens != null || row.cache_write_tokens != null;
    const input = hasCache ? Math.max(0, rawInput - cacheRead - cacheWrite) : rawInput;
    if (input + output + cacheRead + cacheWrite === 0) continue;

    const occurredAt = row.occurred_at ? new Date(row.occurred_at) : null;
    if (!occurredAt || Number.isNaN(occurredAt.getTime())) continue;

    const generation =
      typeof row.generation_id === "string" && row.generation_id
        ? row.generation_id
        : String(index);

    events.push({
      external_id: `cursor:${generation}`,
      provider: "cursor",
      surface: "cursor_agent",
      model: typeof row.model === "string" && row.model ? row.model : "unknown",
      occurred_at: occurredAt.toISOString(),
      input_tokens: input,
      output_tokens: output,
      cache_read_tokens: cacheRead,
      cache_write_tokens: cacheWrite,
      reasoning_tokens: 0,
      source: "cursor_hook",
      confidence: hasCache ? "exact" : "partial",
    });
  }
  return events;
}
