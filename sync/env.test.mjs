import test from "node:test";
import assert from "node:assert/strict";
import { applyEnv, decodeEnv } from "./env.mjs";

test("utf-16 notepad files still yield the email", () => {
  const text = "SUPABASE_EMAIL=me@example.com\r\nSUPABASE_PASSWORD=secret\r\n";
  const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
  const env = {};
  applyEnv(decodeEnv(buffer), env);
  assert.equal(env.SUPABASE_EMAIL, "me@example.com");
  assert.equal(env.SUPABASE_PASSWORD, "secret");
});

test("a blank password stays missing", () => {
  const env = {};
  applyEnv("SUPABASE_URL=https://example.supabase.co\nSUPABASE_EMAIL=\n", env);
  assert.equal(env.SUPABASE_URL, "https://example.supabase.co");
  assert.equal(env.SUPABASE_EMAIL, "");
});
