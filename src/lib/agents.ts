import fs from "fs";
import os from "os";
import path from "path";
import { spawn, spawnSync } from "child_process";
import crossSpawn from "cross-spawn";

/**
 * Agent engine registry. Each engine is a CLI we spawn as a subprocess; the
 * differences between them are only three: where the binary lives, which args
 * it takes, and how its stdout stream maps onto our normalized events.
 */

export type EngineId = "claude" | "codex";

export type AgentEvent =
  | { type: "session"; id: string }
  | { type: "token"; text: string }
  | { type: "result"; text: string }
  | { type: "status"; text: string }
  | { type: "error"; error: string; subtype?: string };

export type LaunchInput = {
  prompt: string;
  systemPrompt: string;
  sessionId?: string;
};

export type Launch = {
  args: string[];
  /** Written to the child's stdin before closing it. Keeps huge prompts off the
   *  command line — Windows caps a command line at 32767 chars and a pasted
   *  article plus the system prompt blows past that. */
  stdin?: string;
};

export type Engine = {
  id: EngineId;
  label: string;
  envVar: string;
  bin: string;
  supportsImagegen: boolean;
  buildLaunch: (input: LaunchInput) => Launch;
  /** Stateful because a turn's text can arrive as several messages. */
  createParser: () => (line: string) => AgentEvent[];
  /** Returns a reason string when the CLI is installed but unusable. */
  checkAuth?: (binPath: string) => string | null;
};

// ---------------------------------------------------------------- discovery

function candidates(bin: string): string[] {
  const home = os.homedir();

  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
    const localAppData =
      process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
    return [
      // native installer (claude install) — the default since v2
      path.join(home, ".local", "bin", `${bin}.exe`),
      path.join(appData, "npm", `${bin}.cmd`),
      path.join(appData, "npm", `${bin}.exe`),
      path.join(localAppData, "Programs", bin, `${bin}.exe`),
    ];
  }

  return [
    path.join(home, ".local/bin", bin),
    `/usr/local/bin/${bin}`,
    `/opt/homebrew/bin/${bin}`,
    path.join(home, ".npm-global/bin", bin),
  ];
}

function probePath(bin: string): string | null {
  try {
    const cmd = process.platform === "win32" ? "where" : "command";
    const args = process.platform === "win32" ? [bin] : ["-v", bin];
    const result = spawnSync(cmd, args, {
      encoding: "utf-8",
      shell: process.platform !== "win32",
      timeout: 2000,
    });
    if (result.status === 0 && result.stdout) {
      const hits = result.stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && fs.existsSync(l));
      // On Windows `where` lists the extensionless bash shim first, and
      // CreateProcess cannot run that — prefer a real .cmd/.exe.
      if (process.platform === "win32") {
        return hits.find((h) => /\.(cmd|bat|exe)$/i.test(h)) ?? hits[0] ?? null;
      }
      return hits[0] ?? null;
    }
  } catch {
    // ignore
  }
  return null;
}

export function findEnginePath(engine: Engine): string | null {
  const override = process.env[engine.envVar];
  if (override && fs.existsSync(override)) return override;
  for (const candidate of candidates(engine.bin)) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return probePath(engine.bin);
}

// ------------------------------------------------------------------- claude

const claude: Engine = {
  id: "claude",
  label: "Claude",
  envVar: "CLAUDE_CLI_PATH",
  bin: "claude",
  supportsImagegen: false,

  buildLaunch: ({ prompt, systemPrompt, sessionId }) => {
    const args = [
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--verbose",
      "--append-system-prompt",
      systemPrompt,
      "--allowedTools",
      "Bash",
      "WebFetch",
      "Read",
      "--max-budget-usd",
      // A full carousel runs ~250k tokens; 1.00 dies mid-build.
      process.env.CHAT_MAX_BUDGET_USD || "5.00",
      "--name",
      "carrusel-chat",
    ];
    if (sessionId) args.push("--resume", sessionId);
    return { args };
  },

  createParser: () => (line: string): AgentEvent[] => {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line);
    } catch {
      return [];
    }

    if (event.type === "system" && event.subtype === "init" && event.session_id) {
      return [{ type: "session", id: event.session_id as string }];
    }

    if (event.type === "assistant" && event.message) {
      const msg = event.message as Record<string, unknown>;
      if (msg.type !== "message" || !Array.isArray(msg.content)) return [];
      const out: AgentEvent[] = [];
      for (const block of msg.content) {
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") {
          out.push({ type: "token", text: b.text });
        }
      }
      return out;
    }

    if (event.type === "result") {
      const out: AgentEvent[] = [];
      if (event.session_id) {
        out.push({ type: "session", id: event.session_id as string });
      }
      if (event.is_error || (event.subtype && event.subtype !== "success")) {
        out.push({
          type: "error",
          error:
            typeof event.result === "string" && event.result
              ? event.result
              : `Claude CLI stopped: ${event.subtype}`,
          subtype: event.subtype as string | undefined,
        });
        return out;
      }
      if (typeof event.result === "string" && event.result) {
        out.push({ type: "result", text: event.result });
      }
      return out;
    }

    return [];
  },
};

// -------------------------------------------------------------------- codex

/** Shell command → short human status line. */
function summarizeCommand(command: string): string {
  // Windows commands arrive wrapped in a fully-qualified powershell.exe call
  // with doubled backslashes; the interesting part is what comes after it.
  const flat = command
    .replace(/\\\\/g, "\\")
    .replace(/^"?[A-Za-z]:\\.*?(powershell|pwsh|cmd)\.exe"?\s*(-Command)?\s*/i, "")
    .replace(/^(bash|sh|zsh)\s+-l?c\s*/i, "")
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/generated_images|image_gen/i.test(flat)) return "Guardando imagen…";

  const api = flat.match(/https?:\/\/localhost:\d+\/api\/([^\s"']+)/);
  if (api) {
    const method = flat.match(/-X\s+(GET|POST|PUT|DELETE|PATCH)/i)?.[1] ?? "GET";
    const resource = api[1]
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "…") // uuids add nothing here
      .replace(/\/$/, "");
    return `${method.toUpperCase()} /${resource}`;
  }

  const head = flat.slice(0, 56);
  return head.length < flat.length ? `${head}…` : head;
}

const codex: Engine = {
  id: "codex",
  label: "Codex",
  envVar: "CODEX_CLI_PATH",
  bin: "codex",
  supportsImagegen: true,

  buildLaunch: ({ prompt, systemPrompt, sessionId }) => {
    const flags = [
      "--json",
      // Set through -c rather than -s: `exec resume` rejects -s, and this way
      // the flag list is identical for a fresh run and a resumed one.
      "-c",
      "sandbox_mode=workspace-write",
      // The agent drives the app over curl against localhost, so the sandbox
      // has to allow network. Approvals must be off: exec has no TTY to ask on.
      "-c",
      "sandbox_workspace_write.network_access=true",
      "-c",
      "approval_policy=never",
      // The user's global MCP servers are irrelevant here and cost ~4s of
      // failed auth handshakes on every turn.
      "-c",
      "mcp_servers={}",
      // "-" makes the CLI read the prompt from stdin instead of argv.
      "-",
    ];
    const args = sessionId
      ? ["exec", "resume", sessionId, ...flags]
      : ["exec", ...flags];

    // The system prompt rides in on stdin rather than `-c
    // developer_instructions=`: on Windows the CLI is a .cmd, so the spawn goes
    // through cmd.exe, whose command line caps at 8191 chars — well under our
    // ~9KB prompt. Resent every turn so the agent always sees the carousel's
    // current slides, which is what --append-system-prompt does for Claude.
    return {
      args,
      stdin: systemPrompt
        ? `${systemPrompt}\n\n---\n\n# User message\n\n${prompt}`
        : prompt,
    };
  },

  createParser: () => {
    let seenMessage = false;

    return (line: string): AgentEvent[] => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line);
      } catch {
        return []; // tracing logs go to stderr, but be tolerant anyway
      }

      if (event.type === "thread.started" && event.thread_id) {
        return [{ type: "session", id: event.thread_id as string }];
      }

      if (event.type === "turn.failed") {
        const err = event.error as { message?: string } | undefined;
        return [{ type: "error", error: err?.message || "Codex turn failed" }];
      }

      if (event.type === "error") {
        return [
          { type: "error", error: (event.message as string) || "Codex error" },
        ];
      }

      if (event.type === "item.started" || event.type === "item.completed") {
        const item = event.item as Record<string, unknown> | undefined;
        if (!item) return [];

        // A turn can emit several agent messages; they arrive complete, one at
        // a time, so we stream them as tokens rather than waiting for the end.
        if (item.type === "agent_message" && event.type === "item.completed") {
          const text = item.text;
          if (typeof text !== "string" || !text) return [];
          const prefix = seenMessage ? "\n\n" : "";
          seenMessage = true;
          return [{ type: "token", text: prefix + text }];
        }

        if (event.type !== "item.started") return [];

        if (item.type === "command_execution" && typeof item.command === "string") {
          return [{ type: "status", text: summarizeCommand(item.command) }];
        }
        if (item.type === "web_search") {
          return [{ type: "status", text: "Buscando en la web…" }];
        }
        // item.type === "error" here is an advisory (e.g. truncated skill
        // descriptions), not a turn failure — never surface it as an error.
        if (item.type === "error" && typeof item.message === "string") {
          return [{ type: "status", text: item.message.slice(0, 80) }];
        }
      }

      return [];
    };
  },

  checkAuth: (binPath) => {
    try {
      const result = spawnSync(binPath, ["login", "status"], {
        encoding: "utf-8",
        timeout: 5000,
        shell: /\.(cmd|bat)$/i.test(binPath),
      });
      const out = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      if (/logged in/i.test(out)) return null;
      return "sin sesión — corré: codex login";
    } catch {
      return null; // never block on a failed probe
    }
  },
};

// ----------------------------------------------------------------- registry

export const ENGINES: Record<EngineId, Engine> = { claude, codex };
export const ENGINE_IDS = Object.keys(ENGINES) as EngineId[];
export const DEFAULT_ENGINE: EngineId = "claude";

export function isEngineId(value: unknown): value is EngineId {
  return typeof value === "string" && value in ENGINES;
}

export function getEngine(id: unknown): Engine {
  return isEngineId(id) ? ENGINES[id] : ENGINES[DEFAULT_ENGINE];
}

export type EngineStatus = {
  id: EngineId;
  label: string;
  available: boolean;
  supportsImagegen: boolean;
  reason?: string;
};

// ponytail: module-level cache, no TTL — probing costs a subprocess and the
// answer only changes when the user installs or logs in, which needs a restart
// of nothing but this dev server anyway.
const authCache = new Map<EngineId, string | null>();

export function getEngineStatus(engine: Engine): EngineStatus {
  const base = {
    id: engine.id,
    label: engine.label,
    supportsImagegen: engine.supportsImagegen,
  };

  const binPath = findEnginePath(engine);
  if (!binPath) {
    return { ...base, available: false, reason: "no instalado" };
  }

  if (engine.checkAuth) {
    if (!authCache.has(engine.id)) {
      authCache.set(engine.id, engine.checkAuth(binPath));
    }
    const reason = authCache.get(engine.id);
    if (reason) return { ...base, available: false, reason };
  }

  return { ...base, available: true };
}

export function listEngineStatus(): EngineStatus[] {
  return ENGINE_IDS.map((id) => getEngineStatus(ENGINES[id]));
}

// ------------------------------------------------------------- process utils

/**
 * child.kill() on Windows leaves the CLI's own children (bash, curl) orphaned,
 * and enough orphans starve the machine into an NT startup failure.
 * ponytail: taskkill shells out; a job object would be tidier if this gets hot.
 */
export function killTree(child: { pid?: number; kill: () => boolean }) {
  if (process.platform === "win32" && child.pid) {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
      }).on("error", () => {});
      return;
    } catch {
      // fall through to plain kill
    }
  }
  child.kill();
}

export type OnceResult = {
  ok: boolean;
  /** Concatenated agent messages. */
  text: string;
  stderr: string;
  exitCode: number | null;
};

/** Run an engine to completion for a single non-interactive turn. */
export function runEngineOnce(
  engine: Engine,
  input: LaunchInput,
  timeoutMs = 180_000
): Promise<OnceResult> {
  const binPath = findEnginePath(engine);
  if (!binPath) {
    return Promise.resolve({
      ok: false,
      text: "",
      stderr: `${engine.label} CLI not found`,
      exitCode: null,
    });
  }

  const { args, stdin } = engine.buildLaunch(input);
  const spawner =
    process.platform === "win32" && /\.(cmd|bat)$/i.test(binPath)
      ? crossSpawn
      : spawn;

  return new Promise((resolve) => {
    const child = spawner(binPath, args, {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    const parse = engine.createParser();
    let buffer = "";
    let text = "";
    let stderr = "";
    let settled = false;

    const consume = (line: string) => {
      for (const event of parse(line)) {
        if (event.type === "token" || event.type === "result") text += event.text;
        if (event.type === "error") stderr += `${event.error}\n`;
      }
    };

    child.stdin?.on("error", () => {});
    child.stdout?.on("error", () => {});
    child.stderr?.on("error", () => {});
    if (stdin) child.stdin?.write(stdin);
    child.stdin?.end();

    child.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) consume(line);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4096);
    });

    const timer = setTimeout(() => killTree(child), timeoutMs);

    const finish = (exitCode: number | null, ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (buffer.trim()) consume(buffer);
      resolve({ ok, text: text.trim(), stderr: stderr.trim(), exitCode });
    };

    child.on("error", (err) => {
      stderr += String(err);
      finish(null, false);
    });
    child.on("exit", (code) => finish(code, code === 0));
  });
}
