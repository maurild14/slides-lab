# Data model and storage

**Read this when** you touch carousels, slides, brand, templates, style presets,
or anything under `/data`.

## Where things live

```
data/                     git-ignored, created by `npm run setup`
├── carousels.json        every carousel, with its slides inline
├── brand.json            one BrandConfig
├── templates.json        carousel snapshots
├── style-presets.json    design rules the agent is told to follow
├── exports/              generated files
└── .font-cache/          base64 @font-face CSS, keyed by family
public/uploads/           uploaded and generated images; also git-ignored
```

There is no database and no migration system. A schema change means writing the
tolerant read in `src/lib/*` yourself — `readDataSafe()` gives you a fallback,
`withBrandDefaults()` is the pattern for filling in missing fields.

## Types

`src/types/carousel.ts` is the source of truth:

```ts
Slide     { id, html, previousVersions[], order, notes }
Carousel  { id, name, aspectRatio, slides[], referenceImages[],
            caption?, hashtags?, designPlan?, chatSessionId,
            chatMessages?, isTemplate, tags[], createdAt, updatedAt }
```

| Constant | Value | Why |
| --- | --- | --- |
| `DIMENSIONS` | `1:1` 1080×1080, `4:5` 1080×1350, `9:16` 1080×1920 | Instagram's exact sizes; `4:5` is the default and the recommended one |
| `MAX_SLIDES` | 20 | Instagram allows 20 per post |
| `MAX_VERSIONS` | 5 | Per-slide undo that survives a reload |
| `MAX_CHAT_MESSAGES` | 200 | The conversation is stored with the carousel |

`designPlan` holds the arc, palette, type scale and per-slide layout the agent
committed to **before** writing any HTML. It exists so a later session editing
one slide respects the carousel's choices instead of improvising a second style.

`chatMessages` lives next to the slides it produced, so switching tabs or
reloading does not lose the conversation.

## The one storage rule

Every mutation goes through `src/lib/data.ts`. Never `fs.writeFile` a file under
`/data`.

```ts
await mutateData<CarouselsData, Slide>(FILE, EMPTY, (data) => {
  const carousel = data.carousels.find((c) => c.id === id);
  if (!carousel) return ABORT_WRITE;   // finish without writing
  // mutate `data` in place
  return slide;                        // whatever the caller needs back
});
```

- **`mutateData` takes the lock around read *and* write.** `writeData` alone
  serialises only the write, which is not enough: two requests read the same
  state, each applies its change to its own copy, and the second write silently
  discards the first. It went unnoticed while the app wrote rarely — a canvas
  that saves on every gesture, with the agent writing through the same routes in
  parallel, hits it routinely. The symptom is a change that vanishes with no
  error anywhere.
- **Writes are atomic**: write `file.tmp`, then `rename`. A crash mid-write
  leaves the previous file intact rather than a truncated one.
- **`async-mutex` is not reentrant.** The locking wrappers must never call each
  other; `readRaw`/`writeRaw` hold no lock and do the actual IO.
- **`ABORT_WRITE`** is how you say "nothing changed" or "not found" — it returns
  `null` to the caller without touching the disk.

## Version history

`updateSlide` pushes the previous HTML onto `slide.previousVersions` whenever the
HTML actually changed, capped at `MAX_VERSIONS` (oldest shifted off).
`POST .../undo` pops one back.

This is the **cross-session safety net**, not the editor's undo. The editor keeps
its own in-memory, per-slide, one-step-per-gesture stack in
`src/lib/slide-history.ts` (`MAX_HISTORY` = 60) — see [canvas.md](canvas.md).
Two mechanisms on purpose: the in-memory one has to be instant and fine-grained,
the stored one has to survive a reload and cannot be either.

## Brand

`BrandConfig` carries colours (primary, secondary, accent, background, surface),
heading/body fonts, custom fonts, a logo path and style keywords. The wizard lets
you skip fields, so stored colours come back as empty strings — and
`background: ${color}` with an empty string is a declaration the browser silently
drops, which reads as "the shape tool inserts nothing". `withBrandDefaults()`
fills every blank; call it on read, always.

## Uploads

`public/uploads/` is the only image location. Generated images always land there
as `.png` — the PNG export inlines that path and silently drops anything else.
`findUploadRefs()` in `src/lib/upload-paths.ts` is the single parser of how a
reference can be written; see [export.md](export.md) for why that matters.
