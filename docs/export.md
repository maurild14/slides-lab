# Export

**Read this when** you work on PNG / JPG / PDF / ZIP output or on Puppeteer.
Files: `src/lib/export-slides.ts`, `src/lib/fonts.ts`,
`src/app/api/carousels/[id]/export/route.ts`.

## The pipeline

```
slide.html
  → getInlinedFontCSS(extractFontFamilies(html))   base64 @font-face
  → inlineImages(html)                             /uploads/* → data: URI
  → wrapSlideHtml(html, ratio, { inlineFontCss })  the shared contract
  → Puppeteer page at exact dimensions
  → screenshot / PDF
```

`buildSlideDocument()` is shared by the exporter **and the audit**, so a measured
slide and an exported one are byte-for-byte the same document. A warning about a
slide nobody can reproduce in the PNG would be worse than no warning at all.

## Formats

| `format` | Output |
| --- | --- |
| `png` (default) | 1080×1080 / 1080×1350 / 1080×1920 |
| `png-transparent` | Chrome skips the default white backdrop |
| `jpg` | `quality` 1–100 |
| `pdf` | Always one file, the whole carousel |

One slide is one file, several are a ZIP (`archiver`, compression level 5).

`png-transparent` only produces holes where the slide itself paints nothing — a
slide whose root div has a background colour still comes out opaque, which is the
honest result.

## Rules that cost a bug

**Slides export one at a time.** Chrome composites only the foreground tab, so
concurrent screenshots hang until the protocol timeout. Do not "optimise" this
into a `Promise.all`.

**Images must be inlined with `replaceAll`, not `replace`.** The same file used
by two elements would otherwise leave the second reference pointing at a path
that no longer resolves once the document is loaded from memory.

**`findUploadRefs()` has to match all four quote forms.** The canvas stores what
the browser reserialises, so a style it touched comes back as `url(&quot;…&quot;)`;
the agent writes `url('…')`; bare `url(…)` is legal too. Matching only literal
quotes dropped every canvas-edited image from the export *and* from the audit
render — the path stayed relative, resolved against `about:blank`, never loaded,
and the agent approved slides whose main image was missing. That function is
import-free so `npm run check:canvas` covers all four forms.

**Generated images always land in `public/uploads/` as `.png`.** The PNG export
inlines that path and silently drops anything else.

**The response is a binary download, not JSON.** A blob URL carries no
`Content-Disposition`, so the filename has to be read off the response headers —
downloading the blob directly saved every export as `download` with no
extension. And revoking the blob URL in the same tick cancels the download.

**Failed inlining is not fatal.** If a file cannot be read, or resolves outside
`public/uploads` (`/uploads/../…`), the original path is kept and the image
simply does not load — the slide still exports.

**Slide pages are locked down** (`newSlidePage()`, used by export, audit and the
contact sheet): JavaScript off, and request interception lets through only
`data:` and Google Fonts. Slide HTML is agent-written; without this a slide
could fetch the API, the LAN or `file://` from inside the exporter.

## Browser lifecycle

ZIP downloads use Archiver 8's named `ZipArchive` constructor (the default
factory was removed in v8). Keep the stream error handler when changing it.

One singleton browser, relaunched every `MAX_EXPORTS_BEFORE_RESTART` (50) exports
or whenever it drops the connection. Launched headless with `--disable-gpu`; the
Chrome sandbox stays on unless the process runs as root (Docker, some CI), where
Chrome cannot start sandboxed and `--no-sandbox --disable-setuid-sandbox` are
added.

Route `maxDuration` is 120s. A carousel of 20 slides at ~1s each fits; if that
ever stops being true, the fix is a job, not a longer timeout.

## Fonts

`getInlinedFontCSS()` fetches the Google Fonts CSS for the families found in the
markup, downloads each face and rewrites it as base64 `@font-face`. Results are
cached in memory and on disk under `data/.font-cache/`. A screenshot cannot wait
on a CDN, and a missed font changes every measurement — see
[audit.md](audit.md).
