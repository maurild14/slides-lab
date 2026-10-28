# CLAUDE.md

The project instructions live in **[AGENTS.md](AGENTS.md)** — one file, read by
every engine. It is imported below, so you already have it: follow its map and
open the `docs/` page for the area you are about to touch **before** you edit.

@AGENTS.md

Everything past this point is Claude Code specific. If you are Codex, Cursor or
anything else, `AGENTS.md` is the whole contract and you can stop here.

## Slash commands

Defined in `.claude/commands/`, each with a narrow `allowed-tools` list:

| Command | Does |
| --- | --- |
| `/start [port]` | `npm run setup`, launch the dev server, open the browser |
| `/stop [port]` | Kill the dev server on that port (defaults to 3000) |
| `/doctor` | `node scripts/doctor.mjs` — Node, engines, deps, data, port |
| `/reset` | Wipe local carousels and uploads, re-seed defaults (asks first) |

Prefer these over re-deriving the commands: `/start` already handles the
`.next` cache, the port and the health check.

## Working in this repo

- **Shell.** The primary environment is Windows + PowerShell. Bash is available
  but a command you hand to *the agent under test* runs through PowerShell, so
  the system prompt says `curl.exe`, not `curl`.
- **Long-running dev server.** Start it in the background and keep it up;
  writing files inside the project triggers Fast Refresh and a reload kills any
  in-flight chat stream. Agent scratch files belong in `os.tmpdir()` or
  `.tmp-slides/`.
- **After any `npm install`, delete `.next`.** Turbopack's cache goes stale and
  the dev server loops on Fast Refresh forever.
- **You are also the product.** `/api/chat` spawns *your own CLI* as a
  subprocess. When you change `src/lib/chat-system-prompt.ts` or
  `src/lib/agents.ts` you are editing the harness you run inside — see
  [docs/agent-engines.md](docs/agent-engines.md) before touching either.

## Commit style

Present tense, subject line describing the user-visible effect
(`feat: el editor muestra cuánto queda del plan`), body explaining the *why*
and the failure it fixes, and a final line naming the verification that was
actually run. Spanish or English — follow the language of the person you are
working with; the history is mostly Spanish. Full rules in
[CONTRIBUTING.md](CONTRIBUTING.md).
