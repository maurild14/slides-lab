# Slide HTML

**Read this when** you write, parse or render the HTML a slide stores. File:
`src/lib/slide-html.ts`.

## What a slide stores

**Body-level HTML only.** No `<html>`, no `<head>`, no `<!DOCTYPE>`.
`wrapSlideHtml()` adds the document, the font loading and the dimension box.
That function is **the shared rendering contract between preview and export** —
if a slide looks right in the editor and wrong in the PNG, the bug is almost
always something that bypassed it.

Rules for the stored markup:

- Inline styles or a `<style>` tag. No external stylesheets.
- Images as `/uploads/{filename}` paths.
- Google Font family names in `font-family` declarations.
- **No `<script>` tags** — the iframe sandbox drops them anyway.
- Target the carousel's aspect ratio: `1:1` 1080×1080, `4:5` 1080×1350,
  `9:16` 1080×1920.

## `wrapSlideHtml(slideHtml, aspectRatio, { inlineFontCss? })`

Produces the full document:

- `html, body { width: Wpx; height: Hpx; overflow: hidden }` and a
  `* { margin: 0; padding: 0; box-sizing: border-box }` reset.
- `svg { pointer-events: all }`, so a vector can be grabbed anywhere in its box
  and not only on the stroke it painted.
- Fonts: **preview** gets a `fonts.googleapis.com` `<link>` built from the
  families found in the markup; **export** gets `inlineFontCss` — base64
  `@font-face` rules, because a screenshot cannot wait on a CDN.

`extractFontFamilies()` scans `font-family` declarations, splits on commas and
drops the CSS generics. It is a regex over the source, so a family assembled at
runtime will not be found — declare families literally.

## Rendering surfaces

| Surface | Sandbox | Notes |
| --- | --- | --- |
| Thumbnails, filmstrip, dashboard cards | `sandbox=""` | `loading="lazy"` |
| Editable canvas | `sandbox="allow-same-origin"` | **must stay eager** — the attach effect waits on its document |
| Export | Puppeteer page, no iframe | see [export.md](export.md) |

**Never `allow-scripts`.** The parent document reaches into the canvas iframe's
DOM and drives every gesture from outside; that is what keeps the stored HTML
identical to what gets exported. See [canvas.md](canvas.md).

## Attributes the app adds

State the editor needs lives in `data-*` attributes **only**, so the export walks
straight past it:

| Attribute | Means |
| --- | --- |
| `data-oc-lock` | Not selectable or movable |
| `data-oc-group` | Group id shared by its members |
| `data-oc-hidden` | Layer hidden — also writes `display:none` inline, because the export renders raw HTML with none of our stylesheets |
| `data-oc-name` | The name shown in the layers list |

Transient selection attributes (`data-oc-hover`, `data-oc-selected`,
`data-oc-busy`) and `contenteditable` are stripped on the way out **and on
save**, so an interrupted session cannot persist them
(`stripInspectorAttrs()` in `src/lib/inspector-utils.ts`).

## Referencing an image

`/uploads/x.png` can legally appear as `url(/uploads/x.png)`,
`url('/uploads/x.png')`, `url("/uploads/x.png")` or `url(&quot;…&quot;)` — the
canvas stores what the browser reserialises, the agent writes single quotes.
`findUploadRefs()` in `src/lib/upload-paths.ts` is the **one** place that knows
all four forms. Matching only literal quotes dropped every canvas-edited image
from the export *and* from the audit render: the path stayed relative, resolved
against `about:blank`, never loaded, and the agent approved slides whose main
image was missing. That file is import-free so the self-check covers it without
a browser.
