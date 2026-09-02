# Architecture

**Read this when** you need the shape of the whole system before diving into one
part of it, or you are adding something that spans more than one area.

## Four processes

```
┌─ Browser ────────────────────────────────────────────────┐
│  Dashboard (/)          Editor (/carousel/[id])          │
│                         ├─ ToolRail + panels             │
│                         ├─ SlideCanvas ──► <iframe>      │  sandbox, no JS:
│                         ├─ ContextToolbar │  slide DOM   │  the parent drives
│                         ├─ InspectorPanel └──────────────│  every gesture
│                         ├─ LayersPanel                   │
│                         └─ ChatPanel  ◄── SSE            │
└────────────────────────────┬─────────────────────────────┘
                             │ fetch / EventSource
┌─ Next server (node runtime) ▼────────────────────────────┐
│  /api/*  ──►  src/lib/*  ──►  /data/*.json  (mutex)      │
│     │                                                    │
│     ├── /api/chat ──── spawn ──►  ┌─ Claude or Codex CLI ┐
│     │      ▲   SSE                │  drives the app with │
│     │      └───────────────────── │  curl against /api   │
│     │                             └──────────────────────┘
│     └── /api/carousels/[id]/export ─► Puppeteer ─► Chrome │
└──────────────────────────────────────────────────────────┘
```

The CLI subprocess is a *client* of the same public API the browser uses. That
is the whole integration: there is no private agent channel, no shared memory,
no RPC. Anything the agent can do, you can do with `curl`.

## Data flow of one slide

1. The agent (or a panel) `POST`s body-level HTML to
   `/api/carousels/[id]/slides`. See [api.md](api.md).
2. `src/lib/carousels.ts` writes it through `src/lib/data.ts` — mutex, atomic
   write, five-version history. See [data-model.md](data-model.md).
3. The route audits it: one Chrome page, measured boxes out one side and a PNG
   out the other. See [audit.md](audit.md).
4. The browser renders it with `wrapSlideHtml()` into a sandboxed iframe. The
   same function feeds the exporter, so preview and export cannot disagree. See
   [slide-html.md](slide-html.md).
5. The user edits it directly on the canvas; autosave `PUT`s it back. See
   [canvas.md](canvas.md).
6. Export screenshots it at exact Instagram dimensions. See [export.md](export.md).

## Module map

### `src/lib` — all the logic, none of the React

| File | Owns |
| --- | --- |
| `data.ts` | JSON storage: mutex, atomic write, `mutateData`, `ABORT_WRITE` |
| `carousels.ts` | Carousel and slide CRUD, version history, reference images |
| `brand.ts`, `templates.ts`, `style-presets.ts` | The other three JSON stores |
| `agents.ts` | Engine registry: discovery, launch args, stream parsing, usage |
| `chat-system-prompt.ts` | The prompt, rebuilt per turn from brand + carousel |
| `slide-html.ts` | `wrapSlideHtml()` — the shared preview/export contract |
| `slide-audit.ts` / `slide-audit-rules.ts` | Measure + render; the pure rules half |
| `export-slides.ts` | Puppeteer browser pool, PNG/JPG/PDF, font and image inlining |
| `fonts.ts` | Google Font CSS fetch + base64 inlining, cached on disk |
| `canvas-utils.ts` | Geometry and the slide DOM contract (groups, locks, order) |
| `slide-history.ts` | Pure undo/redo stack with a cursor |
| `slide-elements.ts` | Catalogs (shapes, lines, text presets, fonts) as HTML strings |
| `element-style.ts` | Text effects, filters, frames, shadows, flip — string builders |
| `slide-reflow.ts` / `slide-batch.ts` | Aspect-ratio re-layout; rewriting stored HTML |
| `inspector-utils.ts` | Selection attrs, breadcrumb, in-place text editing helpers |
| `upload-paths.ts` | `findUploadRefs()` — the one parser of `/uploads/` references |
| `utils.ts` | `cn()`, `generateId()`, `now()` |

`slide-audit-rules.ts` and `upload-paths.ts` are deliberately **import-free** so
the self-checks can run them without Chrome or Next. Keep them that way.

### `src/components`

| Directory | Owns |
| --- | --- |
| `editor/` | The canvas, filmstrip, toolbars, export button, preview |
| `editor/rail/` | The six tool panels and their shared chrome (`panel-kit.tsx`) |
| `editor/inspector/` | The properties panel, split by selection type |
| `chat/` | Chat panel, input, message, engine selector, reference images |
| `brand/` | The brand wizard and its pickers |
| `templates/` | Template gallery and card |
| `layout/`, `ui/` | Top bar and the primitive kit (button, dialog, menu, field…) |

### `src/app`

`page.tsx` is the dashboard, `carousel/[id]/page.tsx` the editor, and everything
under `api/` is a route handler. All routes that spawn a process or drive Chrome
declare `runtime = "nodejs"` and `dynamic = "force-dynamic"`.

## The one structural rule

**The iframe has no script permission, so the parent document owns every
interaction.** Selection, move, resize, rotate, marquee, panning, in-place text
editing and layer ordering are all implemented in `SlideCanvas` against the
iframe's DOM from outside. There is no message channel, no injected script, and
no "edit mode" — the slide is always editable. This is what makes the exported
HTML identical to what you saw. See [canvas.md](canvas.md).
