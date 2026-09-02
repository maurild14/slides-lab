# Decisions

**Read this when** something looks under-built and you want to know whether it is
an oversight or a choice. Every entry says what was skipped and what would make
it worth adding.

The rule for this page: **only add a constraint after a real failure, and only
remove one when it has genuinely become redundant.** A rule nobody can trace to a
bug is a rule the next reader deletes.

## Storage

**JSON files, not a database.** The whole app is one user on one machine, and
`/data` is inspectable with `cat`. Add a database when two people need the same
carousel at once — not before.

**No migrations.** Schema changes are absorbed by tolerant reads
(`readDataSafe`, `withBrandDefaults`). Worth a migration runner the first time a
change cannot be expressed as a default.

**One mutex per file, whole-file rewrites.** A carousel is a few hundred KB and
writes are rare enough. If a deck ever gets big enough that rewriting it on every
autosave shows up in a profile, the fix is per-carousel files, not a smarter
diff.

## Testing

**No test framework.** Two `assert`-based self-checks
(`npm run check:canvas`, `npm run check:agents`) that import straight from
`src/lib`. They exist because a self-check that needs a runner, fixtures and a
headless Chrome to verify arithmetic stops being run. That is also why
`slide-audit-rules.ts` and `upload-paths.ts` are import-free.

Add a real framework when there is a second contributor and CI. Until then the
scripts have to stay runnable with one command and no setup.

## The audit

**Geometry only.** Contrast, collision and Instagram's safe area were considered
and left out: they need a judgement call about intent, and a warning the agent
learns to ignore is worse than no warning. See [audit.md](audit.md).

**Partial overflow is reported for text only.** A shape bleeding off the edge is
deliberate design; cut-off text never is. The missing datum is whether an element
is decorative, and nothing declares that today.

**Warnings only advise.** The slide is saved before it is measured — a Chrome
that failed to start must never turn a good write into an error.

**The PNG is captured at two thirds.** Full-size renders were 31k of the 131k
tokens a nine-slide run grew by. Two thirds costs 44% of that and still renders
24px body text legibly.

## The agent

**No private tool surface.** The agent drives the app with `curl` against the
public API. Anything it can do, you can reproduce from a terminal, and there is
one contract to keep working instead of two.

**One system-prompt file per server process**, overwritten each turn. Two chats
running concurrently in the same dev server would race on it — give it the
session id if that ever becomes a real workflow.

**`readPlanUsage` reads the whole rollout JSONL.** It is local and runs once per
turn.

**Usage totals in `localStorage`.** "This session" means the conversation, and
clearing it should reset them. A server-side counter would mean a different
definition and a store nobody asked for.

## The editor

**Undo is in memory, one step per gesture.** The server's five-version history is
the cross-session net. Two mechanisms because the in-memory one has to be instant
and fine-grained and the stored one has to survive a reload; neither can be both.

**The aspect-ratio reflow is an approximation** — one uniform factor plus a
re-centring translation over a whitelist of px declarations. It asks before
running and leans on the stored version history to undo, instead of pretending to
be a real re-layout engine.

**"Aplicar a todas" skips the active slide.** It already has the change on
screen, and re-sending it would reload its iframe and drop the selection.

**No toast system.** Errors appear where they happened, in a `role="alert"` line.
A toast is a second place to look and a second thing to dismiss.

**One empty/error state component.** `empty-state.tsx` with `tone="error"`, used
by the dashboard, the gallery and the inspector.

**`/api/images` indexes the filesystem, not a JSON registry.** Add the registry
when you want the prompt that produced each image kept alongside it.

## Rendering

**The iframe never gets `allow-scripts`.** Everything is driven from the parent.
It costs real work — pointer capture, DOM reads across a realm boundary — and it
buys the guarantee that the exported HTML is exactly what you saw, with no
runtime of ours anywhere in it.

**Fonts are cached on disk under `data/.font-cache/`.** A screenshot cannot wait
on a CDN, and a missed font changes every measurement.

**Chrome is a singleton, relaunched every 50 exports.** Cheaper than a launch per
slide, and the periodic restart is the lazy fix for the leak nobody wants to
chase.
