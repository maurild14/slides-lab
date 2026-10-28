# Slides Lab documentation

One page per topic. [AGENTS.md](../AGENTS.md) is the entry point and holds only
what applies to every task; these pages hold the detail, and you load the one
you need instead of carrying all of it.

Every page opens with a **Read this when** line. Trust it: if your task is not
in that line, the page is not for you.

## Map

| Page | Read this when |
| --- | --- |
| [architecture.md](architecture.md) | You need the shape of the whole system: processes, data flow, module map |
| [api.md](api.md) | You are adding, changing or calling an HTTP route |
| [data-model.md](data-model.md) | You touch carousels, slides, brand, templates, presets or anything in `/data` |
| [agent-engines.md](agent-engines.md) | You touch the chat, the CLI subprocess, the system prompt or usage metering |
| [slide-html.md](slide-html.md) | You write, parse or render the HTML a slide stores |
| [canvas.md](canvas.md) | You work on the editor: selection, gestures, layers, toolbar, panels, undo |
| [audit.md](audit.md) | You work on the loop that lets the agent see what it wrote |
| [export.md](export.md) | You work on PNG / JPG / PDF / ZIP output or Puppeteer |
| [ui.md](ui.md) | You write any component, style, copy, error surface or a11y affordance |
| [imagegen-policy.md](imagegen-policy.md) | You are deciding whether an element should be a generated image |
| [workflows.md](workflows.md) | You are setting up, running the dev loop, verifying, or stuck |
| [decisions.md](decisions.md) | Something looks under-built and you want to know if it is on purpose |

## Rules for these pages

- **One topic per page.** If a fact belongs to two topics, it lives in the one
  that owns the code and the other links to it. Duplicated facts drift.
- **Every rule names its failure.** A rule nobody can trace back to a bug is a
  rule the next reader will delete or ignore. Write "X, because Y broke".
- **Facts, not aspirations.** These pages describe the code as it is. If you
  change the code, change the page in the same commit.
- **Short.** A page past ~150 lines is two topics wearing one filename.
