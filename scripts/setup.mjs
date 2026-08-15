#!/usr/bin/env node
/**
 * Interactive setup for the Anthropic API key.
 *
 * Writes .env.local (gitignored, chmod 600) and then verifies the key against
 * the Models API, which authenticates without generating any tokens. Verifying
 * here means a bad key surfaces now rather than as a failed generation later.
 *
 *   npm run setup          prompt for a key, write it, verify it
 *   npm run setup -- check verify whatever key is already configured
 */
import { createInterface } from "node:readline/promises";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { stdin, stdout } from "node:process";
import path from "node:path";

const ENV_PATH = path.join(process.cwd(), ".env.local");
const KEY_PATTERN = /^sk-ant-[A-Za-z0-9_-]{20,}$/;

const bold = (s) => `[1m${s}[0m`;
const dim = (s) => `[2m${s}[0m`;
const green = (s) => `[32m${s}[0m`;
const red = (s) => `[31m${s}[0m`;
const yellow = (s) => `[33m${s}[0m`;

function readExistingKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  if (!existsSync(ENV_PATH)) return null;
  const match = readFileSync(ENV_PATH, "utf8").match(/^ANTHROPIC_API_KEY\s*=\s*(.+)$/m);
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : null;
}

/** Authenticates without spending tokens. */
async function verify(key) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: key });
  try {
    const model = await client.models.retrieve("claude-opus-5");
    return { ok: true, model: model.display_name ?? model.id };
  } catch (error) {
    const status = error?.status;
    if (status === 401) return { ok: false, reason: "That key was rejected. Check for a typo or a revoked key." };
    if (status === 403) return { ok: false, reason: "The key is valid but lacks permission for this model." };
    if (status === 429) return { ok: true, model: "rate limited, but the key authenticated" };
    return { ok: false, reason: error?.message ?? "Could not reach the API. Check your connection." };
  }
}

function writeKey(key) {
  let body = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  if (/^ANTHROPIC_API_KEY\s*=/m.test(body)) {
    body = body.replace(/^ANTHROPIC_API_KEY\s*=.*$/m, `ANTHROPIC_API_KEY=${key}`);
  } else {
    body = `${body.trimEnd()}\n${body.trim() ? "" : ""}ANTHROPIC_API_KEY=${key}\n`.trimStart();
  }
  writeFileSync(ENV_PATH, body, "utf8");
  try {
    chmodSync(ENV_PATH, 0o600);
  } catch {
    // Windows filesystems reject chmod. The file is still gitignored.
  }
}

async function main() {
  const checkOnly = process.argv.includes("check");
  console.log(`\n${bold("Valycode setup")}\n`);

  const existing = readExistingKey();

  if (checkOnly || existing) {
    if (!existing) {
      console.log(`${yellow("No key configured yet.")} Run ${bold("npm run setup")} to add one.\n`);
      process.exit(1);
    }
    console.log(`Found a key ending ${dim(`...${existing.slice(-6)}`)}. Verifying.\n`);
    const result = await verify(existing);
    if (result.ok) {
      console.log(`${green("Working.")} Authenticated against ${result.model}.`);
      console.log(`\nRun ${bold("npm run dev")} and open http://localhost:3000\n`);
      process.exit(0);
    }
    console.log(`${red("Not working.")} ${result.reason}\n`);
    if (checkOnly) process.exit(1);
  }

  console.log("Paste your Anthropic API key. It starts with sk-ant-");
  console.log(dim("Get one at https://console.anthropic.com/settings/keys"));
  console.log(dim("It is written to .env.local, which is gitignored and never committed.\n"));

  const rl = createInterface({ input: stdin, output: stdout });
  const key = (await rl.question("Key: ")).trim();
  rl.close();

  if (!key) {
    console.log(`\n${yellow("Nothing entered.")} Setup cancelled, no file written.\n`);
    process.exit(1);
  }

  if (!KEY_PATTERN.test(key)) {
    console.log(`\n${red("That does not look like an Anthropic key.")}`);
    console.log("Expected something starting sk-ant- followed by a long string.");
    console.log(`Nothing was written. Run ${bold("npm run setup")} again.\n`);
    process.exit(1);
  }

  console.log("\nVerifying.");
  const result = await verify(key);

  if (!result.ok) {
    console.log(`${red("Rejected.")} ${result.reason}`);
    console.log(`Nothing was written. Run ${bold("npm run setup")} again.\n`);
    process.exit(1);
  }

  writeKey(key);
  console.log(`${green("Working.")} Authenticated against ${result.model}.`);
  console.log(`Saved to ${bold(".env.local")}\n`);
  console.log(`Next: ${bold("npm run dev")} then open http://localhost:3000\n`);
}

main().catch((error) => {
  console.error(`\n${red("Setup failed.")} ${error.message}\n`);
  process.exit(1);
});
