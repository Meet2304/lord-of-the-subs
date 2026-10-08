import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseClaudeJsonl } from "./parse-claude.mjs";
import { parseCodexJsonl } from "./parse-codex.mjs";
import { parseCursorSpool } from "./parse-cursor.mjs";
import { loadEnvFile } from "./env.mjs";

function dataDir() {
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(base, "lord-of-the-subs");
  }
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  return path.join(base, "lord-of-the-subs");
}

async function walkJsonl(dir, found) {
  if (!fs.existsSync(dir)) return;
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walkJsonl(full, found);
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) found.push(full);
  }
}

function readState(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { files: {}, cursorOffset: 0 };
  }
}

function errorText(error) {
  const cause = error?.cause;
  return [error?.message, error?.details, cause?.code, cause?.message].filter(Boolean).join(" — ");
}

function isTransient(error) {
  const text = errorText(error).toLowerCase();
  return (
    text.includes("fetch failed") ||
    text.includes("network") ||
    text.includes("econnreset") ||
    text.includes("timeout") ||
    text.includes("socket")
  );
}

async function upsert(supabase, userId, events) {
  let uploaded = 0;
  for (let index = 0; index < events.length; index += 50) {
    const chunk = events.slice(index, index + 50).map((event) => ({
      ...event,
      user_id: userId,
    }));
    for (let attempt = 1; ; attempt += 1) {
      const { error } = await supabase
        .from("usage_events")
        .upsert(chunk, { onConflict: "user_id,external_id" });
      if (!error) break;
      if (!isTransient(error) || attempt >= 5) throw new Error(errorText(error));
      const waitMs = 1000 * attempt;
      console.error(`Upload stalled (${errorText(error)}). Retrying in ${waitMs / 1000}s.`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    uploaded += chunk.length;
  }
  return uploaded;
}

async function fileChanged(file, state) {
  const stat = await fs.promises.stat(file);
  const previous = state.files[file];
  return !previous || previous.size !== stat.size || previous.mtimeMs !== stat.mtimeMs
    ? stat
    : null;
}

const envPath = path.resolve("sync/.env");
const envTxtPath = path.resolve("sync/.env.txt");
loadEnvFile(path.resolve(".env"), process.env);
const foundEnv = loadEnvFile(envPath, process.env) || loadEnvFile(envTxtPath, process.env);

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const email = process.env.SUPABASE_EMAIL;
const password = process.env.SUPABASE_PASSWORD;

if (!url || !key || !email || !password) {
  const missing = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_EMAIL", "SUPABASE_PASSWORD"]
    .filter((name) => !process.env[name]);
  console.error(`Missing ${missing.join(", ")}.`);
  if (!foundEnv) {
    console.error(`No sync/.env file at ${envPath}`);
    if (fs.existsSync(envTxtPath)) {
      console.error("Found sync/.env.txt. Notepad added .txt. Rename that file to sync\\.env.");
    }
  } else if (missing.includes("SUPABASE_EMAIL") || missing.includes("SUPABASE_PASSWORD")) {
    console.error("The URL and key can stay as they are. Fill SUPABASE_EMAIL and SUPABASE_PASSWORD with the account you used on the site, then save the file.");
  }
  process.exit(1);
}

const supabase = createClient(url, key);
const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
  email,
  password,
});
if (authError || !auth.user) {
  console.error(authError?.message || "Sign-in failed.");
  process.exit(1);
}

const claudeRoot =
  process.env.CLAUDE_CONFIG_DIR
    ? path.join(process.env.CLAUDE_CONFIG_DIR, "projects")
    : path.join(os.homedir(), ".claude", "projects");
const codexRoot = process.env.CODEX_HOME
  ? path.join(process.env.CODEX_HOME, "sessions")
  : path.join(os.homedir(), ".codex", "sessions");
const cursorSpool = path.join(dataDir(), "cursor-hooks.jsonl");
const statePath = path.join(dataDir(), "scan-state.json");
fs.mkdirSync(dataDir(), { recursive: true });

const once = process.argv.includes("--once");
let running = false;

async function scan() {
  if (running) return;
  running = true;
  try {
    const state = readState(statePath);
    const claudeFiles = [];
    const codexFiles = [];
    await walkJsonl(claudeRoot, claudeFiles);
    await walkJsonl(codexRoot, codexFiles);

    let uploaded = 0;
    const sources = [
      [claudeFiles, parseClaudeJsonl],
      [codexFiles, parseCodexJsonl],
    ];
    for (const [files, parse] of sources) {
      for (const file of files) {
        const stat = await fileChanged(file, state);
        if (!stat) continue;
        const text = await fs.promises.readFile(file, "utf8");
        const count = await upsert(supabase, auth.user.id, parse(text, file));
        uploaded += count;
        state.files[file] = { size: stat.size, mtimeMs: stat.mtimeMs };
        fs.writeFileSync(statePath, JSON.stringify(state));
        if (count > 0) console.log(`${path.basename(file)}: ${count} rows`);
      }
    }

    if (fs.existsSync(cursorSpool)) {
      const stat = await fs.promises.stat(cursorSpool);
      const offset = Math.min(state.cursorOffset || 0, stat.size);
      if (stat.size > offset) {
        const handle = await fs.promises.open(cursorSpool, "r");
        const buffer = Buffer.alloc(stat.size - offset);
        await handle.read(buffer, 0, buffer.length, offset);
        await handle.close();
        const text = buffer.toString("utf8");
        const lastNewline = text.lastIndexOf("\n");
        if (lastNewline !== -1) {
          const complete = text.slice(0, lastNewline + 1);
          uploaded += await upsert(supabase, auth.user.id, parseCursorSpool(complete));
          state.cursorOffset = offset + Buffer.byteLength(complete);
        }
      }
    }

    fs.writeFileSync(statePath, JSON.stringify(state));
    if (uploaded > 0) {
      console.log(`${new Date().toISOString()} uploaded ${uploaded} usage rows`);
    }
  } finally {
    running = false;
  }
}

console.log(`Signed in as ${auth.user.email}`);
console.log(`Claude transcripts: ${claudeRoot}`);
console.log(`Codex transcripts: ${codexRoot}`);
console.log(`Cursor hook spool: ${cursorSpool}`);
try {
  await scan();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (once) process.exit(1);
  console.error("The rows that were saved stay saved. The rest will be tried again.");
}

if (once) {
  console.log("Single pass finished.");
} else {
  console.log("Watching for new usage every 20 seconds. Leave this running.");
  setInterval(() => {
    scan().catch((error) => {
      console.error(error instanceof Error ? error.message : error);
    });
  }, 20_000);
}
