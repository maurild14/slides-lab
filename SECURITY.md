# Security

## Reporting a vulnerability

Use GitHub's **private vulnerability reporting**: the repository's *Security* tab →
*Report a vulnerability*. Please don't open a public issue for anything that lets
someone else read files, run commands, or change data on a user's machine.

Include the version or commit, your OS, the engine (Claude or Codex), and the
smallest reproduction you have. You'll get an answer within a week.

## Threat model

Slides Lab is a **single-user app for your own machine**. It has no auth. Its
security rests on nobody else being able to talk to it, and on the AI agent it
spawns being unable to do much beyond building slides.

### What it protects against

- **Other machines on your network.** `npm run dev` and `npm start` bind to
  `127.0.0.1`.
- **Websites you visit driving the API from your browser.** `src/proxy.ts`
  rejects any request whose `Host` isn't `localhost:<port>` / `127.0.0.1:<port>`
  (DNS rebinding) and any browser request whose `Origin` doesn't match (CSRF).
- **Slide HTML.** Slides are rendered in iframes without `allow-scripts`. Export
  runs Puppeteer with JavaScript disabled and request interception that only
  lets through inlined uploads and Google Fonts — no API, no LAN, no `file://`.
- **Uploads and file paths.** Uploads are type- and size-checked, and every
  `/uploads/…` reference is resolved and contained in `public/uploads`; the
  stored data never holds an absolute path. `PUT` routes accept only the editable
  fields.
- **The Claude agent.** It runs with an allowlist: `curl`, `WebFetch`, `Read`
  in `public/uploads` and a private temp dir, `Write` in that temp dir. There is
  no free shell, and with `-p` anything else is denied. The prompt goes in through
  a file and stdin, never argv; the session id and model choices are validated
  before they reach the command line.
- **The Codex agent.** It runs in Codex's `workspace-write` sandbox: it writes to
  the project and the OS temp dir only.

### Risks that remain

- **Prompt injection.** The agent reads web pages (`WebFetch` / Codex network
  access), reference images and your attachments. Any of them can carry
  instructions, and the agent acts with the permissions above.
- **curl is a broad tool.** It can write anywhere your user can (`-o`), and read
  any file your user can (`file://`, `-d @path`) and send it to any host. The Read
  allowlist does not cover curl, and `-d @file` is how the agent posts long
  bodies, so it can't simply be denied.
- **The agent can read the project directory.** Claude Code always allows reads
  inside the working directory, `.env.local` and `data/` included.
- **Your own Claude Code settings apply on top.** Allow rules in
  `~/.claude/settings.json` widen the agent's allowlist.
- **Codex has network access and writes inside the project.**
- **Other local users.** On a shared machine, anyone who can reach
  `127.0.0.1:<port>` can use the app.

**Never expose Slides Lab to a network** — no `-H 0.0.0.0`, no port forwarding,
no tunnel, no reverse proxy. Anyone who reaches it can spend your AI plan and,
through the agent, act on your files.
