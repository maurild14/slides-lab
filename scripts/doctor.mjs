#!/usr/bin/env node
// Slides Lab — environment diagnostic.
// Pure Node, no dependencies, safe to run pre-`npm install`.
// Exit 0 if everything required is OK; exit 1 on any required failure.

import { existsSync, statSync } from "node:fs";
import { execSync, spawnSync } from "node:child_process";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const CHECK = "✓";
const FAIL = "✗";
const INFO = "○";
const WARN = "!";

const checks = [];
let hardFailures = 0;

function add(symbol, label, detail, fatal = false) {
  checks.push({ symbol, label, detail });
  if (fatal && symbol === FAIL) hardFailures += 1;
}

function tryExec(cmd) {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

// Runs a binary by absolute path. execSync would go through a shell, and a
// Windows path full of backslashes gets mangled by bash before it ever runs.
function tryRun(binPath, args) {
  try {
    const r = spawnSync(binPath, args, {
      encoding: "utf-8",
      timeout: 8000,
      shell: /\.(cmd|bat)$/i.test(binPath),
    });
    return `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() || null;
  } catch {
    return null;
  }
}

// 1. Node version
const major = Number(process.versions.node.split(".")[0]);
if (major >= 20) {
  add(CHECK, "Node", `v${process.versions.node}`);
} else {
  add(FAIL, "Node", `v${process.versions.node} (need ≥20 — install from https://nodejs.org)`, true);
}

// 2. AI engines — at least one is required, both is better
function findCli(bin, envVar) {
  const which = tryExec(
    platform() === "win32" ? `where ${bin}` : `command -v ${bin}`
  );
  if (which) {
    const hits = which
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && existsSync(l));
    // On Windows `where` lists the extensionless bash shim first, and
    // CreateProcess cannot run that — prefer a real .cmd/.exe.
    const runnable =
      platform() === "win32"
        ? (hits.find((h) => /\.(cmd|bat|exe)$/i.test(h)) ?? hits[0])
        : hits[0];
    if (runnable) return runnable;
  }
  const isWin = platform() === "win32";
  const appData = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
  const candidates = isWin
    ? [
        process.env[envVar],
        join(homedir(), ".local", "bin", `${bin}.exe`),
        join(appData, "npm", `${bin}.cmd`),
        join(appData, "npm", `${bin}.exe`),
      ]
    : [
        process.env[envVar],
        join(homedir(), ".local/bin", bin),
        `/usr/local/bin/${bin}`,
        `/opt/homebrew/bin/${bin}`,
        join(homedir(), ".npm-global/bin", bin),
      ];
  for (const c of candidates.filter(Boolean)) {
    if (existsSync(c)) return c;
  }
  return null;
}

const claudePath = findCli("claude", "CLAUDE_CLI_PATH");
const codexPath = findCli("codex", "CODEX_CLI_PATH");

if (claudePath) {
  add(CHECK, "Claude CLI", claudePath);
} else {
  add(INFO, "Claude CLI", "not found — https://docs.anthropic.com/en/docs/claude-code");
}

if (codexPath) {
  const login = tryRun(codexPath, ["login", "status"]);
  if (login && /logged in/i.test(login)) {
    add(CHECK, "Codex CLI", `${codexPath} (image generation available)`);
  } else {
    add(WARN, "Codex CLI", `${codexPath} — not logged in, run: codex login`);
  }
} else {
  add(INFO, "Codex CLI", "not found — npm i -g @openai/codex (adds image generation)");
}

if (!claudePath && !codexPath) {
  add(FAIL, "AI engine", "no engine found — install Claude CLI or Codex CLI", true);
}

// 3. Dependencies
if (existsSync("node_modules") && statSync("node_modules").isDirectory()) {
  add(CHECK, "Dependencies", "node_modules present");
} else {
  add(FAIL, "Dependencies", "node_modules missing — run `/start` or `npm install`", true);
}

// 4. Data files
const dataFiles = ["brand.json", "carousels.json", "templates.json", "style-presets.json"];
const missingData = dataFiles.filter((f) => !existsSync(join("data", f)));
if (missingData.length === 0) {
  add(CHECK, "Data files", `all ${dataFiles.length} seeded`);
} else if (missingData.length === dataFiles.length) {
  add(FAIL, "Data files", "none seeded — run `/start` or `npm run setup`", true);
} else {
  add(WARN, "Data files", `${missingData.length} missing: ${missingData.join(", ")} — run /start`);
}

// 5. Port 3000
let portStatus = "free";
let portFree = true;
if (platform() !== "win32") {
  const pid = tryExec("lsof -ti :3000");
  if (pid) {
    portStatus = `in use by PID ${pid.split("\n")[0]} — \`/stop\` to kill`;
    portFree = false;
  }
} else {
  // Best-effort on Windows; non-fatal
  const out = tryExec("netstat -ano -p tcp");
  if (out && /:3000\s+.+LISTENING/i.test(out)) {
    portStatus = "in use (run `netstat -ano | findstr :3000` for details)";
    portFree = false;
  }
}
add(portFree ? CHECK : INFO, "Port 3000", portStatus);

// Output
const labelWidth = Math.max(...checks.map((c) => c.label.length));
console.log("");
for (const { symbol, label, detail } of checks) {
  console.log(`  ${symbol}  ${label.padEnd(labelWidth)}   ${detail}`);
}
console.log("");

if (hardFailures > 0) {
  console.log(`  ${hardFailures} required check${hardFailures > 1 ? "s" : ""} failed.`);
  process.exit(1);
} else {
  process.exit(0);
}
