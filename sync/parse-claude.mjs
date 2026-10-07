function num(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed);
}

function cacheWriteTokens(usage) {
  const created = usage.cache_creation_input_tokens ?? usage.cache_creation;
  if (typeof created === "number") return num(created);
  if (created && typeof created === "object") {
    return (
      num(created.ephemeral_5m_input_tokens) +
      num(created.ephemeral_1h_input_tokens)
    );
  }
  return 0;
}

/**
 * Claude Code writes one JSON object per line under ~/.claude/projects.
 * Assistant rows already carry the provider usage object.
 *
 * @param {string} text
 * @param {string} fileId
 */
export function parseClaudeJsonl(text, fileId) {
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
    if (row?.type !== "assistant") continue;
    const usage = row.message?.usage;
    if (!usage || typeof usage !== "object") continue;

    const input = num(usage.input_tokens);
    const output = num(usage.output_tokens);
    const cacheRead = num(usage.cache_read_input_tokens);
    const cacheWrite = cacheWriteTokens(usage);
    if (input + output + cacheRead + cacheWrite === 0) continue;

    const occurred = row.timestamp || row.message?.timestamp;
    const occurredAt = occurred ? new Date(occurred) : null;
    if (!occurredAt || Number.isNaN(occurredAt.getTime())) continue;

    const id = typeof row.uuid === "string" && row.uuid ? row.uuid : `${fileId}:${index}`;
    events.push({
      external_id: `claude:${id}`,
      provider: "anthropic",
      surface: "claude_code",
      model: typeof row.message?.model === "string" ? row.message.model : "unknown",
      occurred_at: occurredAt.toISOString(),
      input_tokens: input,
      output_tokens: output,
      cache_read_tokens: cacheRead,
      cache_write_tokens: cacheWrite,
      reasoning_tokens: 0,
      source: "claude_transcript",
      confidence: "exact",
    });
  }
  return events;
}
