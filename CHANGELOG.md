# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-10-27

First public release.

### Added

- Chat-driven carousel builder: an agent CLI (Claude Code or Codex) is spawned
  per turn and writes slides as HTML/CSS through the app's own HTTP API.
- Engine picker, plus model and effort selection, from the chat panel. Chat
  history lives with the carousel. The panel shows plan usage and tokens.
- The agent checks its own work: each slide is measured and rendered to a PNG,
  with layout warnings, and a contact sheet covers the whole deck.
- Image generation with Codex's built-in `image_gen`, governed by an editable
  policy (`docs/imagegen-policy.md`).
- Canva-style editor: direct manipulation, snapping guides, layers, lock,
  group, hide, tool rail, contextual toolbar, undo history per slide.
- Brand config, templates, style presets, reference images and per-message
  image attachments (up to 20 MB).
- English by default, with a language selector for Spanish (castellano, voseo).
  The choice persists in a cookie and also sets the chat agent's reply language.
- Export to PNG, JPG, transparent PNG, PDF and ZIP at exact Instagram sizes
  (1:1, 4:5, 9:16), plus a caption and hashtag generator.
- Slides Lab logo, favicon and app icon.
- `/start`, `/stop`, `/reset`, `/doctor` slash commands; `check:canvas` and
  `check:agents` self-checks; docs per area in `docs/`.

### Fixed

- Double-click enters text editing both before and after selection, including
  when the selection frame receives the second press. Move, resize and rotate
  remain available.
- Layers follows the current slide while the agent writes and after it finishes;
  stale iframe documents no longer re-pin or autosave the previous HTML.
- Images and fonts created after a production build load under `npm start` as
  well as in dev, with the correct content type and the existing CSP.
- Brand updates reject invalid hex colours, font families and custom font paths
  with 400. The setup wizard shows errors beside the offending field.

### Changed

- Updated GitHub Actions to v7, the minor/patch dependency group, ESLint 10 and
  Archiver 8; ZIP export uses the new Archiver constructor. The regenerated
  Lucide icon catalogue follows its new module/export format.
- CI runs on pull requests and pushes to `main`, avoiding duplicate Dependabot
  runs. Node types track the supported minimum (22); Node-type and TypeScript
  majors require an explicit migration instead of an automatic update.

### Security

- The server binds to `127.0.0.1`, and `src/proxy.ts` rejects requests with a
  foreign `Host` (DNS rebinding) or `Origin` (CSRF), on every route including
  `/uploads`.
- Claude's chat agent runs on an allowlist: `curl` only instead of a free shell.
  `WebFetch` is off unless `CHAT_ALLOW_WEBFETCH=1`, and with it off the prompt
  asks for pasted text instead of fetching URLs.
  Its `Read` permission is scoped to `public/uploads` and a private temp dir;
  request files are staged in that private dir. The system prompt and the user
  message travel by file and stdin, never argv.
  Session ids and model choices are validated before reaching the command line.
- Export runs Puppeteer with JavaScript off and network limited to Google
  Fonts; `/uploads/…` references can no longer escape `public/uploads`.
- Reference images and attachments store only a validated upload URL, never an
  absolute path. `PUT` routes accept only editable fields.
- Runtime upload reads reject traversal and symlinks outside `public/uploads`.
- Agent temp files live in an unguessable `mkdtemp` directory. Font family names
  are whitelisted, and the CSP is tightened.
- A corrupt JSON file is no longer replaced with an empty one: it is kept as a
  `.corrupt-<timestamp>` copy.
- Dependencies: Next.js 16.4.3 (fixes the critical advisory in 16.2.3),
  Puppeteer 25, sharp 0.35; `npm audit` reports no high or critical issues.
  Node ≥ 22.18 is required.

[0.1.0]: https://github.com/maurild14/slides-lab/releases/tag/v0.1.0
