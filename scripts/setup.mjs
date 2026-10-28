#!/usr/bin/env node
// Cross-platform setup for Slides Lab. Runs on macOS, Linux, and Windows.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crossSpawn from "cross-spawn";

const ROOT = process.cwd();

function log(msg) {
  process.stdout.write(msg + "\n");
}

function runSync(cmd, args, opts = {}) {
  const res = crossSpawn.sync(cmd, args, { stdio: "inherit", ...opts });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited with ${res.status}`);
  }
}

function tryProbe(bin) {
  const isWin = process.platform === "win32";
  const cmd = isWin ? "where" : "which";
  try {
    const r = crossSpawn.sync(cmd, [bin], {
      encoding: "utf-8",
      timeout: 2000,
    });
    if (r.status === 0 && r.stdout) {
      const hits = r.stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && fs.existsSync(l));
      // Windows `where` lists the extensionless bash shim first; it is not
      // runnable by CreateProcess, so prefer a real .cmd/.exe.
      if (isWin) return hits.find((h) => /\.(cmd|bat|exe)$/i.test(h)) ?? hits[0] ?? null;
      return hits[0] ?? null;
    }
  } catch {
    // ignore
  }
  return null;
}

function findCliPath(bin, envVar) {
  if (process.env[envVar] && fs.existsSync(process.env[envVar])) {
    return process.env[envVar];
  }

  const home = os.homedir();
  const candidates = [];

  if (process.platform === "win32") {
    const appData =
      process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
    const localAppData =
      process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
    candidates.push(
      path.join(home, ".local", "bin", `${bin}.exe`),
      path.join(appData, "npm", `${bin}.cmd`),
      path.join(appData, "npm", `${bin}.exe`),
      path.join(localAppData, "Programs", bin, `${bin}.exe`)
    );
  } else {
    candidates.push(
      path.join(home, ".local/bin", bin),
      `/usr/local/bin/${bin}`,
      `/opt/homebrew/bin/${bin}`,
      path.join(home, ".npm-global/bin", bin)
    );
  }

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  return tryProbe(bin);
}

function seedDataFiles() {
  const dataDir = path.join(ROOT, "data");
  const uploadsDir = path.join(ROOT, "public", "uploads");
  const exportsDir = path.join(dataDir, "exports");
  const fontCacheDir = path.join(dataDir, ".font-cache");

  for (const dir of [dataDir, uploadsDir, exportsDir, fontCacheDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const seeds = {
    "brand.json": {
      name: "",
      colors: {
        primary: "#1a1a2e",
        secondary: "#16213e",
        accent: "#e94560",
        background: "#ffffff",
        surface: "#f5f5f5",
      },
      fonts: { heading: "Inter", body: "Inter" },
      customFonts: [],
      logoPath: null,
      styleKeywords: [],
      createdAt: "",
      updatedAt: "",
    },
    "carousels.json": { carousels: [] },
    "templates.json": { templates: [] },
    "style-presets.json": { presets: [] },
  };

  for (const [name, contents] of Object.entries(seeds)) {
    const filePath = path.join(dataDir, name);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(contents), "utf-8");
      log(`  Created ${path.relative(ROOT, filePath)}`);
    }
  }
}

function upsertEnvVar(key, value) {
  const envPath = path.join(ROOT, ".env.local");
  let existing = "";
  try {
    existing = fs.readFileSync(envPath, "utf-8");
  } catch {
    // file doesn't exist yet
  }

  // Drop blank lines too: this runs once per engine per setup, and keeping
  // them accumulates a growing gap at the top of the file.
  const lines = existing
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith(`${key}=`));

  lines.push(`${key}=${value}`);

  fs.writeFileSync(envPath, lines.join("\n") + "\n", "utf-8");
}

async function main() {
  log("🎠 Setting up Slides Lab...");
  log("");

  log(
    "📦 Installing dependencies (this may take a moment — Puppeteer downloads Chromium ~300MB)..."
  );
  runSync("npm", ["install"]);
  log("");

  log("📁 Creating data directories...");
  seedDataFiles();
  log("");

  log("🔍 Looking for AI engines...");

  const engines = [
    {
      bin: "claude",
      label: "Claude CLI",
      envVar: "CLAUDE_CLI_PATH",
      install: "https://docs.anthropic.com/en/docs/claude-code",
    },
    {
      bin: "codex",
      label: "Codex CLI",
      envVar: "CODEX_CLI_PATH",
      install: "npm i -g @openai/codex && codex login",
      note: "adds native image generation",
    },
  ];

  let found = 0;
  for (const engine of engines) {
    const cliPath = findCliPath(engine.bin, engine.envVar);
    if (cliPath) {
      found++;
      log(`  ✅ ${engine.label}: ${cliPath}`);
      upsertEnvVar(engine.envVar, cliPath);
    } else {
      log(
        `  ○  ${engine.label} not found${engine.note ? ` (${engine.note})` : ""}`
      );
      log(`     Install: ${engine.install}`);
    }
  }

  if (found === 0) {
    log("");
    log("  ⚠️  No AI engine found — the app runs, but chat is disabled.");
    if (process.platform === "win32") {
      log("  On Windows, run `where claude` to find the path (likely ~\\.local\\bin\\claude.exe).");
    }
  }
  log("");

  if (process.env.OC_SETUP_NO_DEV) {
    log("✅ Setup complete. (Dev server start skipped — caller will handle it.)");
    return;
  }

  log("🚀 Starting Slides Lab...");
  log("  Open http://localhost:3000 in your browser");
  log("");
  runSync("npm", ["run", "dev"]);
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
