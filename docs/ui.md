# UI conventions

**Read this when** you write or review any component, style, copy, error surface
or a11y affordance. Files: `src/app/globals.css`, `src/lib/utils.ts`,
`src/components/ui/*`.

## Tokens

Colours and the type scale are CSS custom properties in `globals.css`, exposed to
Tailwind v4 as `--color-*` and `--text-*`.

| Token | Size | Use |
| --- | --- | --- |
| `text-micro` | 12px | units, counters — never a label |
| `text-label` | 13px | field labels |
| `text-section` | 14px | section headings |
| `text-body` | 15px | base |
| `text-title` | 17px | |
| `text-display` | 22px | |

Colours: `background`, `foreground`, `muted`, `muted-foreground`, `border`,
`border-subtle`, `ring`, `accent`, `accent-foreground`, `accent-soft`, `surface`,
`surface-sunken`, `canvas`, `destructive`.

**Every token added to the type scale must also be registered in the `font-size`
class group in `src/lib/utils.ts`.** Without it, tailwind-merge reads `text-body`
as `text-{color}` and drops the colour declared before it — that is how
`bg-foreground` buttons ended up with near-black text on a near-black fill.

Merge classes with `cn()`. Never concatenate class strings by hand.

## Interaction classes

| Class | Is |
| --- | --- |
| `oc-focus` | The one focus ring, visible with the mouse too |
| `oc-press` | The press transition for buttons |
| `oc-field` | The same transitions **without** the press — a text field that shrank when you clicked it stayed shrunk while you dragged to select or scrub |

No `transition-all`, no raw `z-index` values.

## Errors

**Errors surface where they happened, in a `role="alert"` line. There is no toast
system.** Every mutation that can fail says so; silence is a bug. A `catch {}`
that swallows a user-visible failure is not a simplification, it is the bug.

`src/components/ui/empty-state.tsx` is the **one** empty/error state
(`tone="error"`), used by the dashboard, the template gallery and the inspector.
Do not write a second one.

## Layout and hit areas

- Rows that scroll horizontally need their padding **inside** the scroller:
  `overflow-x-auto` clips at its padding box and cut the focus ring off every
  control in both toolbars. Rows are 44px with the padding inside.
- Dialogs and menus need a max height. One taller than the window pushed its
  title and close button off-screen.
- Icon buttons must not expand their hit area past their neighbour. `icon-sm`
  grew to 40px and ate the click of the sibling after it — almost always Delete.
- Destructive actions ask first, and the confirmation says what is lost.

## Copy

The UI ships in **English** (the default) and **Spanish** (`castellano`, voseo),
switched from the language select in the top bar. The choice is a cookie,
`slides-lab-locale`, so the server reads it too: the root layout renders
`<html lang>` from it, and `/api/chat` tells the agent which language to reply in.

Every user-facing string — screen-reader text included — is English source text
passed through `t()`:

```tsx
const t = useT(); // src/components/locale-provider.tsx
t("Delete “{name}”?", { name });
```

Its Spanish lives in `src/lib/i18n-es.ts`, keyed by the exact English string.
A missing entry falls back to English, so `npm run check:canvas` scans every
literal `t("…")` and fails on one without a Spanish entry or with mismatched
`{placeholders}`. Labels kept in arrays (`TABS`, effect presets, catalog
labels) are English too and translated where they render — `t(tab.label)` —
which that scan cannot see, so add their entries by hand.

Keep the accents in Spanish: `día`, `tamaño`, `configuración`. API error
bodies stay English: they are the HTTP contract, and the agent reads them too.

## Accessibility floor

- One focus style, `oc-focus`, everywhere.
- `aria-expanded` on anything that expands; the chevron must match the state.
- Text contrast at least 4.5:1 — `text-green-500` on the surface was 2.5:1.
- Invisible drag handles are not keyboard stops.
- The active filmstrip thumbnail scrolls itself into view.
- Every destination in the tool rail carries a visible text label. No icon-only
  navigation.

## Components

- Max ~300 lines per file. Split by section, not by inventing an abstraction.
- Read-only slide iframes (thumbnails, filmstrip, dashboard cards) carry
  `loading="lazy"`; **the editable canvas must stay eager**, because the attach
  effect waits on its document.
- `clipboard.writeText` needs a `catch` — it can silently do nothing.
