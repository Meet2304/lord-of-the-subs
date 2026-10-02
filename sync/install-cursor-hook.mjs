import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "cursor-hook.mjs",
);
const command = `node ${scriptPath}`;
const hooksPath = path.join(os.homedir(), ".cursor", "hooks.json");

let config = { version: 1, hooks: {} };
if (fs.existsSync(hooksPath)) {
  const parsed = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${hooksPath} is not a JSON object. Edit it by hand.`);
  }
  config = parsed;
}

config.version = config.version ?? 1;
config.hooks = config.hooks ?? {};
const stop = Array.isArray(config.hooks.stop) ? config.hooks.stop : [];
const already = stop.some((hook) => hook && hook.command === command);
if (!already) stop.push({ command });
config.hooks.stop = stop;

fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
fs.writeFileSync(hooksPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Cursor stop hook installed in ${hooksPath}`);
console.log("Restart Cursor so it reloads hooks.");
