# Contributing

PRs welcome. Read [AGENTS.md](AGENTS.md) first — it is short, it maps every area
to its doc in [`docs/`](docs/README.md), and it lists the rules that each cost a
real bug.

## Setup

Node ≥ 22.18 (`nvm use` reads `.nvmrc`), then:

```bash
npm run setup   # installs deps, creates /data, seeds defaults, looks for the engines
npm run dev     # http://127.0.0.1:3000
```

The chat needs [Claude Code](https://docs.anthropic.com/en/docs/claude-code) or
[Codex](https://developers.openai.com/codex/cli) logged in. Everything else works
without them. Each chat turn spends your own plan — see the README's *Costs*.

## Before you open a PR

Run these, in this order, and say in the PR which ones you ran:

```bash
npm run check:canvas
npm run check:agents
npm run lint
npx tsc --noEmit
npm run build
```

CI runs the same plus `npm audit --audit-level=high`. There is no test framework:
new pure logic gets an `assert` in one of the two `check:*` scripts
([docs/workflows.md](docs/workflows.md)).

## Conventions

- Components stay under ~300 lines; split by section, not by abstraction.
- Types in `src/types/`, logic in `src/lib/`, components in `src/components/`.
- Every write under `/data` goes through `src/lib/data.ts`.
- Merge classes with `cn()` from `src/lib/utils.ts`.
- Errors show up where they happened, in a `role="alert"` line.
- Comments explain *why*, usually by naming the failure that forced the line.
- Update the `docs/` page your change invalidates, in the same PR.
- Touching the agent's permissions (`src/lib/agents.ts`) or the proxy
  (`src/proxy.ts`)? Explain the threat in the PR — see [SECURITY.md](SECURITY.md).

## Language

| What | Language |
| --- | --- |
| UI copy | Spanish (*castellano*, voseo) |
| Code, comments, `docs/` | English |
| Commit messages, PR descriptions | Spanish or English |

Commits: present tense, a `feat:` / `fix:` / `docs:` / `chore:` prefix, a subject
that describes what the user sees (`fix: el export ya no pierde las imágenes`),
a body that explains why, and a last line naming the checks you ran.

## Security issues

Not in public issues. Use private vulnerability reporting ([SECURITY.md](SECURITY.md)).

By contributing you agree your work is released under the [MIT License](LICENSE)
and that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).
