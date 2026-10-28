# Agent engines

**Read this when** you touch the chat, the CLI subprocess, the system prompt, or
the plan/token counters. Files: `src/lib/agents.ts`,
`src/lib/chat-system-prompt.ts`, `src/app/api/chat/route.ts`,
`src/components/chat/*`.

## The idea

`/api/chat` spawns a **coding-agent CLI as a subprocess** and streams its output
back over SSE. The agent is not given a private tool surface: it is told to drive
the app with `curl` against the same routes the browser uses
([api.md](api.md)). Whatever the agent can do, you can reproduce from a terminal.

Two engines are registered in `src/lib/agents.ts`; the user picks per message.

| | Claude | Codex |
| --- | --- | --- |
| Binary | `claude` | `codex` |
| Path override | `CLAUDE_CLI_PATH` | `CODEX_CLI_PATH` |
| System prompt travels via | `--append-system-prompt-file` (a file in `privateTmpDir()`) | stdin |
| User's message travels via | stdin | stdin (after the system prompt) |
| Session resume | `--resume <id>` | `exec resume <id>` |
| Shell | `curl` / `curl.exe` only, writes only in `privateTmpDir()` | Codex sandbox (`workspace-write`) |
| Native image generation | no | yes (`gpt-image-2`, billed to the ChatGPT plan) |
| Auth probe | none | `codex login status` |
| Model | `--model <alias>` | `-m <slug>` |
| Reasoning effort | `--effort <level>` | `-c model_reasoning_effort=<level>` |

## Picking a model and an effort level

The chat panel has three dropdowns: engine, model, effort. Model and effort
both default to `""`, which passes **no flag at all** and leaves the CLI on
whatever its own config names — that is the safe state, and the one to keep
working if a slug is ever retired upstream.

The lists live in `agents.ts` (`CLAUDE_MODELS`, `CODEX_MODELS`, `EFFORTS`) and
ride out to the browser on `EngineStatus`, so there is one copy and it is the
same one `buildLaunch` validates against. Both CLIs happen to take the same
five levels; Codex's `ultra` exists on three models only and is left out rather
than offered where it 400s. Regenerate the Codex list from `codex debug models`
(keep `visibility === "list"`); Claude's aliases track its latest releases and
do not need regenerating.

**`model` and `effort` are strings from a browser that end up in the argv of a
CLI that runs shell commands.** `pickChoice()` inside `buildLaunch` drops
anything not offered by name, and that is the only check — put nothing between
the request body and `buildLaunch` that could be mistaken for one.
`check:agents` asserts that `--dangerously-skip-permissions` as a model name
never reaches argv.

The session id crosses the same boundary and lands right after `--resume`, so
`pickSessionId()` keeps only a UUID (`/^[0-9a-f-]{36}$/i`); anything else starts
a fresh session. Also asserted in `check:agents`.

Both flags are re-sent on a resumed session, so a thread follows the dropdowns
instead of staying pinned to what it was created with. For Codex they must go
**before** the `-` that switches the prompt to stdin — anything after it is
read as prompt text.

## The `Engine` contract

Adding an engine means filling in one object — nothing outside `agents.ts` knows
an engine's name:

```ts
type Engine = {
  id; label; envVar; bin; supportsImagegen;
  buildLaunch(input): { args, stdin? };        // how to start a turn
  createParser(): (line) => AgentEvent[];      // stdout line → UI events
  checkAuth?(binPath): string | null;          // installed but unusable → why
  readPlanUsage?(sessionId): UsageEvent | null; // for engines that hide it
};
```

`AgentEvent` is the wire format the chat panel consumes: `session`, `token`,
`result`, `status`, `usage`, `error`. `createParser` is **stateful** because one
turn's text can arrive as several messages.

Discovery (`findEnginePath`) checks the env override, then per-platform install
locations, then `where`/`command -v`. On Windows `where` lists the extensionless
bash shim first and `CreateProcess` cannot run that, so a real `.cmd`/`.exe` is
preferred.

## Hard-won rules

**Everything the agent reads or stages lives in `privateTmpDir()`**: the system
prompt file, slide renders, contact sheets, JSON bodies. It is one `mkdtemp`
directory per server process (0700 on POSIX). The files used to sit straight in
`os.tmpdir()` under predictable names (`oc-slide-<id>.png`), so another local
user could plant or swap the image the agent was told to Read.

**The prompt's API base is `http://127.0.0.1:<PORT>`**, read from the `PORT`
Next sets once it binds — the same value `src/proxy.ts` checks `Host` against.
A hardcoded `localhost:3000` sent the agent to whatever owned that port.

**Never put the system prompt on the command line.** It carries the full HTML of
every slide, so it grows with the deck: ~17KB empty, 43KB at four slides, 53KB at
nine. Windows caps a command line at 32767 chars and the spawn died with
`ENAMETOOLONG` once a carousel had four slides. Claude reads it from a file,
Codex from stdin. On Windows the Codex binary is a `.cmd`, so the spawn goes
through `cmd.exe` whose limit is 8191 — well under even an empty prompt. Anything
added to that prompt has to respect the same rule. The user's message too: it can
be 50,000 chars, so both engines read it from stdin (`claude -p` with no
positional prompt reads stdin).

**Claude's `--allowedTools` is `Bash(curl *)`, `Bash(curl.exe *)`, an
`Edit(//<privateTmpDir>/**)` rule, and `Read` scoped to
`//<project>/public/uploads/**` and `//<privateTmpDir>/**`, plus `WebFetch`
only when `CHAT_ALLOW_WEBFETCH=1`.** With it off, the system prompt tells
both engines not to fetch a URL and to ask for the text instead; Codex's
sandbox keeps network access regardless, since it reaches the app over
localhost. The shell used to
be bare `Bash`, i.e. any command, with fetched web pages in the input. That is
everything the prompt asks for: curl against the API, and long bodies written
with the Write tool into the temp dir (Edit rules are what gate Write). Claude
Code checks each subcommand of a compound command, and `-p` has nobody to ask,
so anything else is denied — verified with `touch`, `node -e` and a
`curl …; echo > file` compound. Claude Code's built-in read-only commands (`ls`,
`cat`, `whoami`…) still run, but only inside the working directory.

`Read` used to be bare too, so an injected instruction could read any file on
disk and hand it to curl. The two folders hold every image the agent is told to
look at: references, attachments, audit PNGs, contact sheets. Verified with a
real `claude -p`: both folders read, a file in `%TEMP%` outside them is denied.
Two holes remain. Claude Code always lets the agent read its working directory
(the project root, `.env.local` included). And curl reads files itself
(`file://`, `-d @path`), which no Read rule covers; `-d @` is how the agent
posts long bodies, so it cannot be denied. Allow rules in the user's own
`~/.claude` settings still apply on top.

**Codex runs `workspace-write` with `os.tmpdir()` in `writable_roots`.** The
prompt tells it to stage long JSON bodies there, because writing them inside the
project triggers Fast Refresh and the reload kills the chat stream. Without that
root the write came back as "patch rejected: writing outside of the project" and
the run died with the carousel half built. `approval_policy=never` (exec has no
TTY to ask on) and `network_access=true` (it talks to localhost).

**The user's global MCP servers load on every turn** and cost ~4s of failed auth
handshakes. `-c mcp_servers={}` does *not* stop that: `-c` merges into the config
table, it does not replace it — `codex mcp list -c mcp_servers={}` still lists
every server. The only thing that works is one
`-c mcp_servers.<name>.enabled=false` per name read out of the user's
`config.toml`. Not worth 4s, but their stderr is loud, which is why a real
failure must never be reported as `exited with code N` plus that stderr.

**A stale `CODEX_CLI_PATH` looks exactly like a crash.** `.env.local` pins the
binary, `findEnginePath` trusts the override before anything else, and the
Codex desktop app updates its own copy without touching that one. A CLI older
than the `model` pinned in `~/.codex/config.toml` gets a 400 —
"the 'gpt-6-astra' model requires a newer version of Codex" — which arrives as
`turn.failed` on stdout and exit 1. Check `codex --version` against
`npm view @openai/codex version` before believing anything on stderr.

**On Windows the prompt says `curl.exe`.** Codex shells out through PowerShell,
where bare `curl` is `Invoke-WebRequest` and takes different flags.

**Codex's sandbox helper fails to start now and then**
(`orchestrator_helper_exit_nonzero`), and every image read in that run dies with
it. It is transient — Codex reads PNGs fine, inside the workspace and out,
verified directly. The prompt tells the agent to note the failure and carry on
with the warnings rather than retry or abandon. **Never diagnose this as "Codex
cannot read images."**

**Codex runs in code mode.** Shell calls arrive wrapped in JavaScript
(`tools.exec_command({"cmd":"…"})`), and writing a file, viewing an image or
generating one arrive as `file_change` / `image_view` / `extension` items rather
than `command_execution`. All of them need a status line, and unlike
`command_execution` they are accepted on `item.completed` too, because code mode
does not reliably announce a start. Without this the status line showed the last
shell command for minutes and working runs looked hung — measured silences of
3.9 and 3.0 minutes with no event at all, which is why `ChatPanel` also shows a
clock once a status is 20s old. `statusForSlowItem()` and `summarizeCommand()`
own this translation; both are covered by `npm run check:agents`.

**A Codex `item.type === "error"` is an advisory**, not a turn failure — surface
it as a status line. Only `turn.failed` and a top-level `error` are real.

**Windows reports a failed process *startup* as an NT status code**
(`>= 0xC0000000`, e.g. `0xC0000142 STATUS_DLL_INIT_FAILED`). The CLI never ran;
the OS refused to map it. `/api/chat` retries once after 250ms.

**The SSE client can vanish mid-stream** (tab reload, HMR, "Stop generating").
Writing to a closed controller throws, and because the writes happen inside
subprocess event handlers the throw is uncaught and kills the Next dev server
worker. The route guards every write with a `closed` flag.

## Usage metering

The chat panel shows how much of the engine's plan is **left** and how many
tokens the session has **spent**. The plan is the number you act on; the tokens
are a count of what happened.

Each engine is pinned to the window it is actually billed on: Claude to its
five-hour block (`rate_limit_event`, a 0-1 fraction per window), Codex to the
weekly one (the longer of the two it reports — which of `primary`/`secondary`
holds it varies by plan, and it is not always the fuller one). The event carries
`planUsedPct` — what the CLI measured — and the panel subtracts, so the raw
number is never stored inverted.

Codex prints none of this in its stream. `turn.completed` gives the turn's
tokens; the percentage and the thread total are read out of its rollout log at
`~/.codex/sessions/<date>/rollout-*-<threadId>.jsonl` by `readPlanUsage()` once
the subprocess exits. A resumed thread keeps writing to the file it was created
in, so the date is not ours to guess — one recursive glob on the id suffix finds
it.

Totals live in `localStorage` next to the session id, because that is what "this
session" means: clearing the conversation resets them.

## The system prompt

`buildSystemPrompt(brand, carousel, stylePreset, engineId, locale)` rebuilds it
every turn, so the agent always sees the carousel's current slides. `locale`
comes from the browser's `slides-lab-locale` cookie and sets the language the
agent replies in ([ui.md](ui.md#copy)); the prompt itself stays English. It
contains the whole workflow, not just context:

1. Decide the design before writing any HTML, and store it in `designPlan`.
2. Build one slide at a time, editing rather than inventing.
3. Read what comes back — `warnings` and `pngPath` ([audit.md](audit.md)).
4. Judge the image, not just the numbers.
5. Fix, and check the fix.
6. Look at the contact sheet before calling it done.

It also injects `docs/imagegen-policy.md`, which you can edit freely, and the
`${CURL}` API examples. **A route the prompt does not mention does not exist as
far as the agent is concerned** — adding a route means adding it there too.

## Changing any of this

`npm run check:agents` runs both parsers and the rollout reader against a
fixture `CODEX_HOME`. Any change to a parser, a status line or the usage math
needs an assert there — the alternative is finding out from a user whose panel
shows 0% left.
