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
  /** Plan consumption + token count. `totalTokens` is absolute (it replaces
   *  what the client has), `tokens` is a turn's delta (it adds). */
  | {
      type: "usage";
      tokens?: number;
      totalTokens?: number;
      planUsedPct?: number;
      planLabel?: string;
    }
  | { type: "error"; error: string; subtype?: string };

export type LaunchInput = {
  prompt: string;
  systemPrompt: string;
  sessionId?: string;
  /** Both are user choices from the chat panel, and both are dropped unless
   *  they name one of the offered options — see `pickChoice`. Empty or unknown
   *  means "pass no flag", i.e. whatever the CLI's own config says. */
  model?: string;
  effort?: string;
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
  /** For engines that don't put plan usage in their stream: dig it out after
   *  the turn. Called on exit with the resolved session id. */
  readPlanUsage?: (
    sessionId: string
  ) => Extract<AgentEvent, { type: "usage" }> | null;
};

// ------------------------------------------------- models and effort levels

/** One entry in the model / effort dropdowns. */
export type EngineChoice = { id: string; label: string };

/**
 * Both CLIs happen to take the same five levels: `claude --effort <level>`
 * and `codex -c model_reasoning_effort=<level>`. Codex also has `ultra`, on
 * three of its models only; it is left out rather than offered where it 400s.
 */
const EFFORTS: EngineChoice[] = [
  { id: "low", label: "Esfuerzo bajo" },
  { id: "medium", label: "Esfuerzo medio" },
  { id: "high", label: "Esfuerzo alto" },
  { id: "xhigh", label: "Esfuerzo muy alto" },
  { id: "max", label: "Esfuerzo máximo" },
];

/**
 * ponytail: hand-kept lists. Codex can enumerate its own catalog
 * (`codex debug models`, keep `visibility === "list"`), but that is a 400KB
 * subprocess per call and Claude has no equivalent, so both stay static. The
 * cost of one going stale is bounded: picking nothing passes no flag and the
 * CLI uses its own configured model, so a dead slug is only ever something the
 * user chose by name — and the engine says so in words. Regenerate from the
 * same command.
 */
const CLAUDE_MODELS: EngineChoice[] = [
  // `claude --help`: an alias tracks the latest release of that model.
  { id: "opus", label: "Opus" },
  { id: "sonnet", label: "Sonnet" },
  { id: "haiku", label: "Haiku" },
  { id: "fable", label: "Fable" },
];

const CODEX_MODELS: EngineChoice[] = [
  { id: "gpt-6-astra", label: "GPT-6-Astra" },
  { id: "gpt-5.6-sol", label: "GPT-5.6-Sol" },
  { id: "gpt-5.6-terra", label: "GPT-5.6-Terra" },
  { id: "gpt-5.6-luna", label: "GPT-5.6-Luna" },
  { id: "gpt-5.5", label: "GPT-5.5" },
  { id: "gpt-5.4-mini", label: "GPT-5.4-Mini" },
  { id: "gpt-5.3-codex-spark", label: "GPT-5.3-Codex-Spark" },
];

const MODELS: Record<EngineId, EngineChoice[]> = {
  claude: CLAUDE_MODELS,
  codex: CODEX_MODELS,
};

/**
 * The trust boundary. `model` and `effort` arrive as JSON from the browser and
 * end up as arguments to a CLI that runs shell commands, so anything not
 * offered by name is dropped instead of forwarded: an unknown value means the
 * engine's own default, never a flag we did not mean to pass.
 */
function pickChoice(
  choices: EngineChoice[],
  value: string | undefined
): string | undefined {
  if (!value) return undefined;
  return choices.some((c) => c.id === value) ? value : undefined;
}

/**
 * One private directory per server process for every file the agent is handed
 * or stages: the system prompt, slide renders, contact sheets, JSON bodies.
 * They used to sit straight in os.tmpdir() under predictable names
 * (`oc-slide-<id>.png`), so any other local user could pre-create or swap the
 * file the agent was told to Read. mkdtemp picks an unguessable name and
 * creates it 0700 on POSIX; on Windows %TEMP% is already per-user.
 *
 * Lives here rather than in its own module because the check scripts import
 * this file under plain node, which resolves no extensionless sibling import.
 * On globalThis because Next bundles a module once per route, and each copy
 * would otherwise mint its own directory.
 * ponytail: never cleaned up; the OS temp sweeper gets it. Add an exit hook if
 * renders ever pile up between reboots.
 */
export function privateTmpDir(): string {
  const g = globalThis as { __slidesLabTmpDir?: string };
  if (!g.__slidesLabTmpDir || !fs.existsSync(g.__slidesLabTmpDir)) {
    g.__slidesLabTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "slides-lab-"));
  }
  return g.__slidesLabTmpDir;
}

/** Rate-limit window → the label shown next to the percentage. */
function windowLabel(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440} d`;
  return `${Math.round(minutes / 60)} h`;
}

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

  buildLaunch: ({ prompt, systemPrompt, sessionId, model, effort }) => {
    // The prompt carries the full HTML of every slide in the carousel, so it
    // grows with the deck: ~17KB empty, 43KB at four slides, 53KB at nine.
    // Windows caps a command line at 32767 characters, so passing it as an
    // argument stopped the spawn outright with ENAMETOOLONG once a carousel
    // had four slides. The -file variant reads it off disk instead, and has
    // no such ceiling.
    //
    // ponytail: one file per server process, overwritten each turn. Two chats
    // running concurrently in the same dev server would race on it — give it
    // the session id if that ever becomes a real workflow.
    const promptFile = path.join(privateTmpDir(), "system-prompt.txt");
    fs.writeFileSync(promptFile, systemPrompt, "utf-8");

    const args = [
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--verbose",
      "--append-system-prompt-file",
      promptFile,
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
    // Both are "for the current session", so they are re-sent on a --resume
    // too: the panel's dropdowns are what the next turn runs on, not what the
    // first turn happened to start with.
    const pickedModel = pickChoice(CLAUDE_MODELS, model);
    if (pickedModel) args.push("--model", pickedModel);
    const pickedEffort = pickChoice(EFFORTS, effort);
    if (pickedEffort) args.push("--effort", pickedEffort);
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

    // The CLI forwards the plan's own rate-limit headers as their own event.
    // `utilization` is a fraction of the window (0-1); the window closest to
    // full is the one that will actually block the next turn.
    if (event.type === "rate_limit_event") {
      const info = event.rate_limit_info as Record<string, unknown> | undefined;
      const windows = (info?.unifiedWindows ?? {}) as Record<
        string,
        { utilization?: number } | undefined
      >;
      const read = (key: string, label: string) =>
        windows[key]
          ? { planLabel: label, planUsedPct: (windows[key]?.utilization ?? 0) * 100 }
          : null;
      // Claude's plan is spent in five-hour blocks; the weekly window is the
      // slower ceiling behind it and only stands in when the block is missing.
      const window = read("five_hour", "5 h") ?? read("seven_day", "7 d");
      return window ? [{ type: "usage", ...window }] : [];
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
      // Per turn, not per session: the client accumulates. Cache reads count,
      // because that is what the plan is charged for.
      const usage = event.usage as Record<string, number> | undefined;
      if (usage) {
        out.push({
          type: "usage",
          tokens:
            (usage.input_tokens ?? 0) +
            (usage.output_tokens ?? 0) +
            (usage.cache_creation_input_tokens ?? 0) +
            (usage.cache_read_input_tokens ?? 0),
        });
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

/** Last path segment of a plain path or a file:// URL, for status lines. */
function baseName(p: unknown): string {
  if (typeof p !== "string" || !p) return "archivo";
  let clean = p.replace(/^file:\/{2,3}/, "");
  try {
    clean = decodeURIComponent(clean);
  } catch {
    // a stray % in a filename is not worth losing the status line over
  }
  return clean.split(/[\\/]/).filter(Boolean).pop() ?? "archivo";
}

/**
 * The long-running items code mode reports: writing a file, looking at a
 * render, generating an image. Returns null for everything else.
 */
export function statusForSlowItem(item: Record<string, unknown>): string | null {
  if (item.type === "file_change") {
    const changes = item.changes;
    const first = Array.isArray(changes)
      ? (changes[0] as { path?: string } | undefined)?.path
      : Object.keys((changes as Record<string, unknown>) ?? {})[0];
    return `Escribiendo ${baseName(first)}…`;
  }
  if (item.type === "patch_apply") {
    return `Escribiendo ${baseName(item.path)}…`;
  }
  if (item.type === "image_view") {
    return `Mirando ${baseName(item.path)}…`;
  }
  // image_gen arrives as a generic extension item tagged by `kind`.
  if (
    item.type === "extension" &&
    typeof item.kind === "string" &&
    item.kind.startsWith("image_gen")
  ) {
    return "Generando imagen…";
  }
  return null;
}

/** Shell command → short human status line. */
function summarizeCommand(command: string): string {
  // Windows commands arrive wrapped in a fully-qualified powershell.exe call
  // with doubled backslashes; the interesting part is what comes after it.
  let flat = command
    .replace(/\\\\/g, "\\")
    .replace(/^"?[A-Za-z]:\\.*?(powershell|pwsh|cmd)\.exe"?\s*(-Command)?\s*/i, "")
    .replace(/^(bash|sh|zsh)\s+-l?c\s*/i, "")
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Code mode hands us JavaScript, not a command: the shell line lives inside
  // `tools.exec_command({"cmd":"…"})`. Without unwrapping it, every status line
  // is the same wrapper prefix and says nothing about what is running.
  const wrapped = flat.match(
    /tools\.exec_command\(\s*\{\s*"cmd"\s*:\s*"((?:[^"\\]|\\.)*)"/
  );
  if (wrapped) flat = wrapped[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");

  if (/generated_images|image_gen/i.test(flat)) return "Guardando imagen…";

  const api = flat.match(
    /https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/api\/([^\s"']+)/
  );
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

  buildLaunch: ({ prompt, systemPrompt, sessionId, model, effort }) => {
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
      // The prompt tells it to stage long JSON bodies in the OS temp dir,
      // because writing them inside the project reloads the dev server and
      // kills the chat stream. workspace-write forbids that by default, so
      // the write came back as "patch rejected: writing outside of the
      // project" and the run died with the carousel half built.
      "-c",
      `sandbox_workspace_write.writable_roots=["${os.tmpdir().replace(/\\/g, "/")}"]`,
      "-c",
      "approval_policy=never",
      // There used to be a `-c mcp_servers={}` here to skip the user's global
      // MCP servers (~4s of failed auth handshakes per turn). It never did
      // anything: `-c` merges into the config table, it does not replace it —
      // `codex mcp list -c mcp_servers={}` still lists every server. Only
      // `mcp_servers.<name>.enabled=false`, one flag per server, works, and
      // that means parsing the user's config.toml for names.
      // ponytail: not worth 4s; do it if the handshakes ever get slower.
    ];
    // `exec resume` takes -m too, so a resumed thread follows the dropdown
    // instead of staying pinned to whatever it was created with.
    const pickedModel = pickChoice(CODEX_MODELS, model);
    if (pickedModel) flags.push("-m", pickedModel);
    const pickedEffort = pickChoice(EFFORTS, effort);
    if (pickedEffort) flags.push("-c", `model_reasoning_effort=${pickedEffort}`);
    // "-" makes the CLI read the prompt from stdin instead of argv. Last,
    // because everything after it would be read as the prompt.
    flags.push("-");

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

      // A turn's own tokens. The plan percentage never reaches this stream —
      // `readPlanUsage` digs it (and the session total) out of the rollout.
      if (event.type === "turn.completed") {
        const u = event.usage as Record<string, number> | undefined;
        if (!u) return [];
        return [
          {
            type: "usage",
            tokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
          },
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

        // Writing a slide, viewing a render and generating an image are the
        // three slowest things the agent does, and none of them used to emit a
        // status: the line kept showing the last shell command for minutes and
        // the run looked dead. Unlike command_execution these are accepted on
        // completion too, because code mode does not always announce a start.
        const slow = statusForSlowItem(item);
        if (slow) return [{ type: "status", text: slow }];

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

  /**
   * `codex exec --json` never emits the plan's rate limits, but the CLI writes
   * them into the thread's rollout log after every turn, alongside the running
   * token total. The rollout is named after the thread id, so one glob finds it.
   * ponytail: reads the whole JSONL; it is local and this runs once per turn.
   */
  readPlanUsage: (sessionId) => {
    const root = path.join(
      process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"),
      "sessions"
    );
    // Nested by date (sessions/YYYY/MM/DD), and a resumed thread keeps writing
    // to the file it was created in, so the date is not ours to guess.
    const suffix = `-${sessionId}.jsonl`;
    const hit = fs
      .readdirSync(root, { recursive: true, encoding: "utf-8" })
      .filter((name) => name.endsWith(suffix))
      .sort()
      .pop();
    if (!hit) return null;
    const file = path.join(root, hit);

    const text = fs.readFileSync(file, "utf-8");
    const at = text.lastIndexOf('"type":"token_count"');
    if (at < 0) return null;
    const start = text.lastIndexOf("\n", at) + 1;
    const end = text.indexOf("\n", at);
    let payload: Record<string, unknown>;
    try {
      payload = (JSON.parse(text.slice(start, end < 0 ? undefined : end)) as {
        payload?: Record<string, unknown>;
      }).payload ?? {};
    } catch {
      return null;
    }

    const info = payload.info as
      | { total_token_usage?: { total_tokens?: number } }
      | undefined;
    const limits = payload.rate_limits as
      | Record<string, { used_percent?: number; window_minutes?: number } | null>
      | undefined;
    // Codex bills against a weekly window, so of the two it reports we want
    // the longer one — which of primary/secondary holds it varies by plan.
    const window = [limits?.primary, limits?.secondary]
      .filter((w): w is { used_percent?: number; window_minutes?: number } => !!w)
      .sort((a, b) => (b.window_minutes ?? 0) - (a.window_minutes ?? 0))[0];

    return {
      type: "usage",
      totalTokens: info?.total_token_usage?.total_tokens,
      planUsedPct: window?.used_percent,
      planLabel: window ? windowLabel(window.window_minutes ?? 0) : undefined,
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
  /** What the model / effort dropdowns offer for this engine. They ride along
   *  with the status so the lists live in exactly one place — the same
   *  constants `buildLaunch` validates against. */
  models: EngineChoice[];
  efforts: EngineChoice[];
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
    models: MODELS[engine.id],
    efforts: EFFORTS,
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
