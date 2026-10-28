# HTTP API

**Read this when** you are adding, changing or calling a route. Everything runs
at `http://localhost:3000`, bound to `127.0.0.1` only; there is no auth, no
versioning and no remote host. `src/proxy.ts` guards every route except Next's own
`/_next/static` and `/_next/image` assets (`/uploads/*` included: it is
rewritten to `/api/uploads` only after the proxy runs): `403`
unless `Host` is `localhost:<port>` or `127.0.0.1:<port>` (DNS rebinding), and
`403` on a non-GET/HEAD whose `Origin` is present and not that host (CSRF).
Requests without `Origin` — the agent's curl — pass. `next.config.ts` adds the
CSP (`'unsafe-eval'` in dev only; `img-src 'self' data: blob:`, the same set the
export resolves; `frame-ancestors 'none'`), `nosniff` and `no-referrer`.
The agent subprocess is a client of exactly these routes — see
[agent-engines.md](agent-engines.md).

Errors are always `{ "error": "message" }` with a `4xx`/`5xx` status. Success
shapes are listed per route below.
Brand value-validation errors also include `field` (for example,
`colors.primary` or `fonts.heading`) so the wizard can reveal the offending field.

## Carousels

| Route | Body / query | Returns |
| --- | --- | --- |
| `GET /api/carousels` | — | `{ carousels: Carousel[] }` |
| `POST /api/carousels` | `{ name, aspectRatio? }` — ratio defaults to `4:5` | `Carousel`, 201 |
| `GET /api/carousels/[id]` | — | `Carousel` |
| `PUT /api/carousels/[id]` | `{ name?, aspectRatio?, tags?, chatSessionId?, chatMessages?, caption?, hashtags?, designPlan? }` | updated `Carousel` |
| `DELETE /api/carousels/[id]` | — | `{ success: true }` |
| `POST /api/carousels/[id]/duplicate` | — | the new `Carousel`, 201 |
| `GET/PUT /api/carousels/[id]/caption` | `{ caption?, hashtags? }` | `{ caption, hashtags }` |
| `GET/POST/DELETE /api/carousels/[id]/references` | `POST { url, name? }`; `DELETE ?refId=` | the reference list |

`references` stores only the public URL, which must match
`/uploads/<name>.(png|jpg|jpeg|webp)`. The agent reads the file off disk with its
`Read` tool, so the system prompt derives the absolute path from the URL on every
turn instead of trusting a stored one. `/api/chat` attachments use the same check.

`PUT /api/carousels/[id]`, `PUT .../slides/[slideId]` and `PUT /api/brand` keep
an explicit whitelist (`src/lib/pick-fields.ts`): unknown keys are dropped, a
known key with the wrong type is a 400. `slides`, `referenceImages`, `id` and the
timestamps cannot be written through them.

## Slides

| Route | Body / query | Returns |
| --- | --- | --- |
| `POST /api/carousels/[id]/slides` | `{ html, notes? }`, `?audit=0` to skip | `Slide & { warnings, pngPath }`, 201 |
| `PUT /api/carousels/[id]/slides` | `{ slideIds: string[] }` — reorder | `{ success: true }` |
| `PUT /api/carousels/[id]/slides/[slideId]` | `{ html?, notes? }`, `?audit=1` to re-measure | updated `Slide` |
| `DELETE /api/carousels/[id]/slides/[slideId]` | — | `{ success: true }` |
| `POST /api/carousels/[id]/slides/[slideId]/duplicate` | — | the new `Slide`, 201 |
| `POST /api/carousels/[id]/slides/[slideId]/undo` | — | the restored `Slide` |
| `GET /api/carousels/[id]/contact-sheet` | — | `{ path }` — every slide, four per row |

**The audit asymmetry is deliberate.** Creating a slide always audits, because
that is the agent's move and it must look at what it wrote. Updating never
audits unless you ask, because `PUT` is the autosave path and it would drive
Chrome on every keystroke. See [audit.md](audit.md).

Creating a slide fails with 400 when the carousel is missing **or** it already
holds `MAX_SLIDES` (20). The error text covers both, on purpose: the caller's
recovery is the same either way.

## Export

`POST /api/carousels/[id]/export` with
`{ format?: "png" | "jpg" | "png-transparent" | "pdf", quality?, slideId? }`.

One slide is one file, several are a ZIP, PDF is always one file. The response
is a binary download with `Content-Disposition`, never JSON — read the filename
off the header, not off the blob URL. Route `maxDuration` is 120s. See
[export.md](export.md).

## Chat and images

| Route | Body | Returns |
| --- | --- | --- |
| `POST /api/chat` | `{ message, engine?, sessionId?, carouselId?, stylePresetId?, attachments? }` | SSE stream of `AgentEvent` |
| `GET /api/chat/check` | — | which engines are installed and logged in |
| `POST /api/images/generate` | `{ prompt, size?, transparent? }` | the generated `/uploads/*.png` |
| `GET /api/images` | — | `{ images }` — the 24 most recent uploads |

`/api/chat` runs `maxDuration = 300` and kills the subprocess at 25 minutes with
a message saying how many slides made it. `attachments` are capped at 8 and must
start with `/uploads/`; the message itself is capped at 50 000 chars.

`/api/images/generate` only works through the Codex CLI (`gpt-image-2`, billed
to the user's ChatGPT plan, no API key). `size` must be one of `1024x1024`,
`1024x1536`, `1536x1024`, `1080x1080`, `1080x1350`, `1080x1920` — an open field
invited the model to invent sizes the API rejects mid-carousel. The output
filename is generated server-side, never taken from the caller, because that
path is handed to a shell.

## Brand, templates, presets, fonts, upload

| Route | Notes |
| --- | --- |
| `GET/PUT /api/brand` | Colours, fonts, logo, style keywords |
| `GET/POST /api/templates` | `POST { carouselId, name?, description? }` snapshots a carousel |
| `GET/DELETE /api/templates/[id]` | |
| `POST /api/templates/[id]/use` | Creates a new carousel from the template, 201 |
| `GET/POST /api/style-presets` | `POST` requires `name` and `designRules` |
| `GET/DELETE /api/style-presets/[id]` | A preset is injected into the system prompt when passed to `/api/chat` |
| `GET /api/fonts` | A curated Google Fonts list, hardcoded — not a live fetch |
| `POST /api/upload` | `multipart/form-data`, field `file`, max 20 MB |
| `GET /uploads/[...path]` | Runtime file read via `/api/uploads/[...path]`, including uploads created after a production build |

`/api/upload` validates by **magic bytes**, not by extension or the declared
MIME type, and accepts images (PNG, JPG, WebP) as well as font files (WOFF2,
TTF) for custom brand fonts.

Brand colours must be `#rgb` or `#rrggbb`. Font families use the renderer's
1–64 ASCII letters/digits/spaces boundary and cannot be blank. Custom font paths
must match `/uploads/fonts/<name>.(woff2|ttf)`. Invalid values return 400 without
writing; the setup wizard uses the same validation on each step and before save.

`/uploads/…` is rewritten before public-file lookup so `next start` can serve
new files too. The read route uses `resolveUploadPath` and checks the real path
to reject traversal and symlinks outside `public/uploads`. Only PNG, JPG/JPEG,
WebP, WOFF2 and TTF are served, with their content types and the app's usual CSP.

## Adding a route

1. `runtime = "nodejs"` and `dynamic = "force-dynamic"` on anything that spawns
   a process, touches the filesystem or drives Chrome.
2. Validate the body and return 400 with a sentence a human can act on. Never
   trust a client-supplied path or filename.
3. Mutate only through `src/lib/*` — never `fs.writeFile` a `/data` JSON.
   See [data-model.md](data-model.md).
4. If the agent should use it, add it to the API section of
   `src/lib/chat-system-prompt.ts` with a `${CURL}` example. A route the prompt
   does not mention does not exist as far as the agent is concerned.
5. Add it to this page.
