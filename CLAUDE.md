# Slides Lab

AI-powered Instagram carousel builder. Next.js 16 + React 19 + TypeScript + Tailwind v4.

## Architecture

- **Frontend**: React app at localhost:3000 with chat panel (left), carousel preview (center), slide filmstrip (bottom)
- **AI Agent**: a CLI (Claude or Codex) spawned as a subprocess via `/api/chat`, streaming back over SSE. The engine is picked per message from the chat panel; `src/lib/agents.ts` holds the registry.
- **Image generation**: Codex's built-in `image_gen` (gpt-image-2, billed to the user's ChatGPT plan, no API key). Codex calls it natively; Claude and the UI go through `POST /api/images/generate`.
- **Storage**: JSON files in `/data/` with async-mutex locking and atomic writes
- **Export**: Puppeteer screenshots HTML slides to PNG at exact Instagram dimensions
- **Slides**: Full HTML documents rendered in sandboxed iframes. `wrapSlideHtml()` in `src/lib/slide-html.ts` is the shared rendering contract between preview and export.
- **Canvas**: floating images are placed and resized from the parent document (`SlideCanvas`), never from inside the iframe — it has no script permission.

## Key Files

- `src/lib/chat-system-prompt.ts` — Dynamic system prompt (injects brand config + carousel context)
- `src/lib/slide-html.ts` — `wrapSlideHtml()` wraps slide body HTML into full documents
- `src/lib/data.ts` — JSON storage with proper async-mutex and atomic writes
- `src/lib/carousels.ts` — Carousel and slide CRUD with version history
- `src/lib/agents.ts` — Engine registry: CLI discovery, launch args, stream parsing, one-shot runs
- `src/lib/canvas-utils.ts` — Slide/screen coordinate math, floating-image insertion, snapping
- `docs/imagegen-policy.md` — When the agent should generate an image; injected into the system prompt, edit freely

## API Routes

All at localhost:3000:

- `POST /api/chat` — agent CLI subprocess + SSE streaming (body takes `engine: "claude" | "codex"`)
- `GET /api/chat/check` — which engines are installed and logged in
- `POST /api/images/generate` — generate a PNG into `public/uploads/` via Codex
- `GET /api/images` — recent images for the editor's drag-and-drop panel
- `GET/POST /api/carousels` — List/create carousels
- `GET/PUT/DELETE /api/carousels/[id]` — Single carousel
- `POST /api/carousels/[id]/slides` — Add slide
- `PUT/DELETE /api/carousels/[id]/slides/[slideId]` — Update/delete slide
- `PUT /api/carousels/[id]/slides` — Reorder slides (body: { slideIds: [...] })
- `POST /api/carousels/[id]/slides/[slideId]/undo` — Undo slide change
- `POST /api/carousels/[id]/export` — Export all slides to PNG ZIP
- `GET/PUT /api/brand` — Brand configuration
- `GET/POST /api/templates` — Templates
- `POST /api/upload` — Image upload (PNG/JPG/WebP only, max 10MB)
- `GET /api/fonts` — Google Fonts list

## Conventions

- Components max ~300 lines per file
- Use `cn()` from `src/lib/utils.ts` for class merging
- Types in `src/types/`, libs in `src/lib/`, components in `src/components/`
- All data mutations go through `src/lib/data.ts` (never direct fs writes for JSON)
- iframe slides use `sandbox=""` when previewing and `sandbox="allow-same-origin"` while editing — never `allow-scripts`
- The agent subprocess drives the app with curl against these same API routes; on Windows the prompt says `curl.exe`, because Codex shells out through PowerShell where bare `curl` is Invoke-WebRequest
- Generated images always land in `public/uploads/` as `.png` — the PNG export inlines that path and silently drops anything else
- `npm run check:canvas` runs the snapping self-check

## Instagram Dimensions

- 1:1 = 1080x1080 (square)
- 4:5 = 1080x1350 (portrait, recommended)
- 9:16 = 1080x1920 (story)
- Max 10 slides per carousel

## Slide HTML Rules

Slides store body-level HTML only (no `<html>`, `<head>`, `<!DOCTYPE>`). The `wrapSlideHtml()` function adds the full document structure, font loading, and dimension constraints. Slides should:

- Use inline styles or `<style>` tags
- Reference images as `/uploads/{filename}` paths
- Use Google Font family names in font-family declarations
- NOT contain `<script>` tags (enforced by iframe sandbox)
- Target the carousel's aspect ratio dimensions
