import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function dataDir() {
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(base, "lord-of-the-subs");
  }
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  return path.join(base, "lord-of-the-subs");
}

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  try {
    const payload = raw.trim() ? JSON.parse(raw) : {};
    const event = {
      generation_id: payload.generation_id ?? null,
      conversation_id: payload.conversation_id ?? null,
      model: payload.model ?? null,
      input_tokens: num(payload.input_tokens),
      output_tokens: num(payload.output_tokens),
      cache_read_tokens: num(payload.cache_read_tokens),
      cache_write_tokens: num(payload.cache_write_tokens),
      occurred_at: new Date().toISOString(),
    };
    const dir = dataDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "cursor-hooks.jsonl"), `${JSON.stringify(event)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  }
  process.stdout.write("{}\n");
});
