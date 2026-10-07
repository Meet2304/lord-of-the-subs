import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseClaudeJsonl } from "./parse-claude.mjs";
import { parseCodexJsonl } from "./parse-codex.mjs";
import { parseCursorSpool } from "./parse-cursor.mjs";

function dataDir() {
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(base, "lord-of-the-subs");
  }
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  return path.join(base, "lord-of-the-subs");
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") process.env[key] = value;
  }
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

async function upsert(supabase, userId, events) {
  let uploaded = 0;
  for (let index = 0; index < events.length; index += 200) {
    const chunk = events.slice(index, index + 200).map((event) => ({
      ...event,
      user_id: userId,
    }));
    const { error } = await supabase
      .from("usage_events")
      .upsert(chunk, { onConflict: "user_id,external_id" });
    if (error) throw new Error(error.message);
    uploaded += chunk.length;
  }
  return uploaded;
}

async function changedFiles(files, state) {
  /** @type {string[]} */
  const changed = [];
  for (const file of files) {
    const stat = await fs.promises.stat(file);
    const previous = state.files[file];
    if (!previous || previous.size !== stat.size || previous.mtimeMs !== stat.mtimeMs) {
      changed.push(file);
      state.files[file] = { size: stat.size, mtimeMs: stat.mtimeMs };
    }
  }
  return changed;
}

loadEnvFile(path.resolve(".env"));
loadEnvFile(path.resolve("sync/.env"));

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const email = process.env.SUPABASE_EMAIL;
const password = process.env.SUPABASE_PASSWORD;

if (!url || !key || !email || !password) {
  console.error("Missing SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_EMAIL, or SUPABASE_PASSWORD.");
  console.error("Copy sync/.env.example to sync/.env and fill in the account you created on the site.");
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
    for (const file of await changedFiles(claudeFiles, state)) {
      const text = await fs.promises.readFile(file, "utf8");
      uploaded += await upsert(supabase, auth.user.id, parseClaudeJsonl(text, file));
    }
    for (const file of await changedFiles(codexFiles, state)) {
      const text = await fs.promises.readFile(file, "utf8");
      uploaded += await upsert(supabase, auth.user.id, parseCodexJsonl(text, file));
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
await scan();

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
