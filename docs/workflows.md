# Workflows

**Read this when** you are setting up, running the dev loop, verifying a change,
or stuck.

## First run

```
npm install
npm run setup      # creates /data, seeds defaults, writes .env.local, checks engines
npm run dev        # :3000
```

Requires Node ≥ 22.18 (the `check:*` scripts run `.ts` straight through Node).
In Claude Code, `/start` does all three plus the port check and opens the
browser; `/doctor` audits the environment.

`.env.local` is optional and holds only path overrides:

| Variable | For |
| --- | --- |
| `CLAUDE_CLI_PATH` | The Claude CLI, if it is not in a standard location |
| `CODEX_CLI_PATH` | Same for Codex |
| `CHAT_MAX_BUDGET_USD` | Claude's per-turn budget cap, default `5.00` |

## The dev loop

- Keep one dev server up. **Writing files inside the project triggers Fast
  Refresh, and the reload kills any in-flight chat stream** — that is why the
  agent is told to stage scratch files in `os.tmpdir()`, and why `.tmp-slides/`
  is git-ignored.
- **After any `npm install`, delete `.next`.** Turbopack's cache goes stale and
  the dev server loops on Fast Refresh forever.
- The app is the fixture. There is no seed script beyond `npm run setup`; make a
  carousel and work against it.

## Verifying

There is **no test framework**, on purpose — see [decisions.md](decisions.md).
Two self-check scripts, plain `assert`, plain node:

| Command | Covers |
| --- | --- |
| `npm run check:canvas` | Snapping, rotated resize, bounding boxes, align/distribute, zoom-about-cursor, undo cursor, filter round-trips, effect clearing, flip vs rotation, element catalogs, audit rules, all four `/uploads/` quote forms |
| `npm run check:agents` | Both engine parsers, the status lines, and the Codex rollout reader against a fixture `CODEX_HOME` |

Then `npm run lint` and `npm run build` — the build is the closest thing to a
typecheck gate.

**Say what you ran.** A change to pure logic that no assert covers is not
finished: add the assert to whichever script owns that area. Both scripts import
straight from `src/lib/*.ts`, which is why `slide-audit-rules.ts` and
`upload-paths.ts` are kept import-free.

Anything touching rendering, export or the agent loop also needs a real run: one
carousel, a few slides, an export.

## Adding a feature — the short checklist

1. Read the `docs/` page for the area first ([README.md](README.md) has the map).
2. Types in `src/types/`, logic in `src/lib/`, component in `src/components/`.
3. Mutations through `src/lib/data.ts` only.
4. New route → document it in [api.md](api.md) **and** in
   `src/lib/chat-system-prompt.ts` if the agent should use it.
5. New pure logic → an assert in one of the two check scripts.
6. Update the `docs/` page in the same commit.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Dev server loops on Fast Refresh | Stale Turbopack cache — delete `.next` |
| Chat stream dies mid-build | Something wrote inside the project. Stage in `os.tmpdir()` |
| `ENAMETOOLONG` on spawn | The system prompt reached the command line. It must go via file (Claude) or stdin (Codex) |
| `patch rejected: writing outside of the project` | `os.tmpdir()` missing from Codex's `writable_roots` |
| `orchestrator_helper_exit_nonzero`, image reads fail | Transient Codex sandbox helper failure. Note it and carry on — **not** "Codex cannot read images" |
| Exit code ≥ 3221225472 on Windows | The CLI never started (NT status). `/api/chat` retries once |
| Status line frozen for minutes | Codex code mode emits `file_change`/`image_view`/`extension`, not `command_execution`. See [agent-engines.md](agent-engines.md) |
| Export hangs | Concurrent screenshots. Slides export one at a time |
| Export saves as `download` with no extension | The filename must come from the response header, not the blob URL |
| Exported slide is missing its image | A `/uploads/` reference form `findUploadRefs()` does not match |
| Preview and export differ | Something bypassed `wrapSlideHtml()`. That is the bug |
| Port 3000 busy | `/stop`, or `/start 3001` |
| Puppeteer fails to launch | Re-install to re-trigger the Chromium download; on Linux install libnss3, libatk1.0-0, libxss1 |
| The agent ignores brand colours | Confirm the brand is saved — it is injected per turn by `chat-system-prompt.ts` |

`npm run doctor` (or `/doctor`) checks Node, both engines, dependencies, the data
directory and the port in one pass.
