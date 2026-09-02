# The slide audit

**Read this when** you work on the loop that lets the agent see what it wrote.
Files: `src/lib/slide-audit.ts` (renders and measures),
`src/lib/slide-audit-rules.ts` (the pure rules).

## Why it exists

The agent used to write HTML blind: the API answered `{"ok": true}` and it never
saw the result, so every design rule in the system prompt was guesswork. Now
**the agent never ships a slide it has not seen.**

Creating a slide returns two things:

| Field | Half of the answer |
| --- | --- |
| `warnings: string[]` | The **objective** half — measured on the real DOM, cannot be hallucinated |
| `pngPath: string` | The **subjective** half — the render, which the agent is told to `Read` and judge |

Closing the carousel adds the third: `GET /api/carousels/[id]/contact-sheet`,
every slide in one image, four to a row. The agent sees one slide at a time and
so never catches what only exists in the set — three slides sharing a layout, one
that breaks the palette, titles that shrink for no reason. It is how a
photographer looks at a whole roll instead of one frame.

## One render, two answers

`auditSlide()` opens the slide once and takes both the PNG and the measurements
off that same page. A second pass would double the cost to say the same thing.

`collectBoxes()` runs inside the page and reads every element the user could
click: name, text, box, scroll extents, whether it paints anything, child count.
The prompt asks for one root div holding every element as a direct child, but a
slide written before that rule (or by hand) can put them on `body` — the
collector handles both.

## What it checks, and what it refuses to

`findIssues(boxes, width, height)` reports **geometry only**:

- completely off-canvas
- zero width or height
- empty (no text, no background, no children)
- partial overflow — **text only**; a shape bleeding off the edge is deliberate
  design, a cut-off text never is
- content larger than its box (`scrollWidth`/`scrollHeight`), i.e. cut-off text

`SLACK` is 2px: a 919.6px box against a 920px declaration is not worth a line of
the agent's attention.

**Contrast, collision and Instagram's safe area were considered and left out.**
They need a judgement call about intent, and a warning the agent learns to ignore
is worse than no warning at all. Every check that stayed is arithmetic with an
exact answer, so it cannot cry wolf.

These defects do not exist in the HTML source: a title that declares
`width: 920px` and measures 932px depends on the real font's metrics, and a regex
over the source gives a false negative.

Messages are in Spanish — they reach the agent, which answers the user in
Spanish, and they quote layer names that are already Spanish.

## Cost control

The PNG is captured at **two thirds** (`AUDIT_PNG_SCALE`), 720×900 for 4:5. An
image in the agent's context is billed by area: on a measured nine-slide run,
looking at renders was 31k of the 131k tokens the conversation grew by. Two
thirds costs 44% of that and still renders 24px body text legibly.

It must be `clip.scale`, **never `deviceScaleFactor`** — the viewport stays
1080-wide so every measurement is unaffected. Verified with a deliberately broken
slide that still reported all three warnings at exact CSS pixels.

## Failure policy

**Warnings only ever advise.** The slide is saved before it is measured, and a
Chrome that failed to start must never turn a good write into an error —
`auditForCarousel()` swallows everything and returns `{}`.

`POST /slides` always audits (that is the agent's move); `PUT /slides/[id]` never
does unless you pass `?audit=1`, because `PUT` is the autosave path and would
drive Chrome on every keystroke. See [api.md](api.md).

## Changing the rules

`slide-audit-rules.ts` is **import-free on purpose**: `npm run check:canvas` runs
it under plain node, and a self-check that had to boot headless Chrome to verify
arithmetic would stop being run. Keep it that way, and add the assert when you
add a rule.
