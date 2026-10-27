---
description: Diagnose Slides Lab setup problems (Node, AI engines, deps, data, port).
allowed-tools: Bash(node *)
---

!`node scripts/doctor.mjs 2>&1; exit 0`

If any check above shows ✗ or a warning, suggest the most likely fix in one line:
- Node version too low → install Node 22.18+ from https://nodejs.org
- No AI engine → install at least one: Claude Code (https://docs.anthropic.com/en/docs/claude-code) or Codex (`npm i -g @openai/codex`)
- Claude CLI missing (○) → optional; install Claude Code if you want it as an engine
- Codex CLI missing (○) → optional; `npm i -g @openai/codex` then `codex login` — this is what enables image generation
- Codex CLI not logged in (!) → run `codex login`
- Dependencies missing → run `/start` (or `npm install`)
- Data files missing → run `/start` (or `npm run setup`)
- Port 3000 in use → run `/stop` if it's a leftover dev server, or use `/start 3001` to pick another port

If everything is ✓, just say "All checks passed."
