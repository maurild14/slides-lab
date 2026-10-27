<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Slides Lab

AI-powered Instagram carousel builder. Next.js 16 (App Router) + React 19 +
TypeScript + Tailwind v4. Local-first: JSON files in `/data`, no database, no
auth, no deploy target. An AI CLI (Claude or Codex) is spawned as a subprocess
and drives the app over HTTP against its own API.

**This file is the map, not the manual.** It holds only what applies to every
task. Each area has one detailed doc in `docs/` — read it before you touch that
area instead of inferring the contract from the code.

## Commands

| Command | What it does |
| --- | --- |
| `npm run setup` | First run: creates `/data`, seeds defaults, checks the engines |
| `npm run dev` | Dev server on :3000 (Turbopack) |
| `npm run build` | Production build — the closest thing to a typecheck gate |
| `npm run lint` | ESLint (flat config, `eslint-config-next`) |
| `npm run check:canvas` | Self-check: geometry, history, elements, effects, upload paths |
| `npm run check:agents` | Self-check: both engine parsers + the Codex rollout reader |
| `npm run doctor` | Diagnose Node / engines / deps / data / port |
| `npm run build:icons` | Regenerate `public/icon-catalog.json` after upgrading `lucide-react` |

There is no test framework. Non-trivial pure logic gets an `assert` line in one
of the two `check:*` scripts — see [docs/workflows.md](docs/workflows.md).

## Read before you work

| If you are touching… | Read |
| --- | --- |
| An HTTP route, or calling one | [docs/api.md](docs/api.md) |
| Carousels, slides, brand, templates, presets, `/data` | [docs/data-model.md](docs/data-model.md) |
| The chat, the CLI subprocess, the system prompt, usage metering | [docs/agent-engines.md](docs/agent-engines.md) |
| The HTML a slide stores, fonts, `wrapSlideHtml()` | [docs/slide-html.md](docs/slide-html.md) |
| The editor: selection, gestures, layers, toolbar, undo, panels | [docs/canvas.md](docs/canvas.md) |
| The measure-and-render loop the agent uses to see its own work | [docs/audit.md](docs/audit.md) |
| PNG / JPG / PDF / ZIP output, Puppeteer | [docs/export.md](docs/export.md) |
| Any component, styling, copy, error surface, a11y | [docs/ui.md](docs/ui.md) |
| Whether the agent should generate an image | [docs/imagegen-policy.md](docs/imagegen-policy.md) |
| Setup, the dev loop, self-checks, troubleshooting | [docs/workflows.md](docs/workflows.md) |
| "Why is it done this dumb way?" | [docs/decisions.md](docs/decisions.md) |
| How the whole thing fits together | [docs/architecture.md](docs/architecture.md) |

Full index: [docs/README.md](docs/README.md).

## Non-negotiables

Each of these cost a real bug. Do not relax one without reading the doc that
explains it.

1. **Slide iframes never get `allow-scripts`.** Read-only thumbnails use
   `sandbox=""`, the editable canvas uses `sandbox="allow-same-origin"`.
   Everything interactive is driven from the parent document.
2. **All JSON mutations go through `src/lib/data.ts`.** Never write a file
   under `/data` directly — the mutex and the atomic write live there.
3. **Nothing may pass the system prompt as a command-line argument.** It grows
   with the deck (~17KB empty, 53KB at nine slides) and Windows caps a command
   line at 32767 chars. Claude gets a file, Codex gets stdin.
4. **Slides export one at a time.** Chrome composites only the foreground tab;
   concurrent screenshots hang until the protocol timeout.
5. **Manipulable state lives in `data-*` attributes only** (`data-oc-lock`,
   `data-oc-group`, `data-oc-hidden`, `data-oc-name`) so the export walks past it.
6. **Errors surface where they happened**, in a `role="alert"` line. There is no
   toast system. Silence on a failed mutation is a bug.
7. **Autosave is the only save path.** Explicit flushes: slide change, page
   unload (`keepalive` PUT), before export, before the agent writes.
8. **On Windows the agent's prompt says `curl.exe`**, because Codex shells out
   through PowerShell where bare `curl` is `Invoke-WebRequest`.

## Conventions

- Components max ~300 lines per file. Split by section, not by abstraction.
- Types in `src/types/`, logic in `src/lib/`, components in `src/components/`.
- Merge classes with `cn()` from `src/lib/utils.ts`. Any new `font-size` token
  added to `globals.css` must also be registered in `cn()`'s class groups.
- Prose in the UI is Spanish (`castellano`). Code, comments and these docs are
  English.
- Comments explain *why*, and usually name the failure that forced the line.

## Verification before you call it done

Run what your change touches, in this order: `npm run check:canvas` and/or
`npm run check:agents`, then `npm run lint`, then `npm run build`. State what
you ran. If a check does not cover your change and the logic is non-trivial,
add the assert.
