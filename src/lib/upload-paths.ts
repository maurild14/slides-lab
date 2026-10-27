/**
 * Finding `/uploads/…` references in slide HTML.
 *
 * Import-free on purpose, like `slide-audit-rules.ts`: the self-check runs it
 * under plain node, which resolves neither the `@/` alias nor puppeteer.
 */
import path from "node:path";

/**
 * Every `/uploads/…` reference, in `src=` and in CSS `url()`.
 *
 * Quotes arrive in three forms and all three have to match. A style the canvas
 * touched comes back as the browser reserialised it — `url(&quot;…&quot;)`,
 * because the value lives inside a double-quoted attribute. The agent writes
 * `url('…')` by hand, and bare `url(…)` is legal too. Matching only literal
 * quotes silently dropped every canvas-edited image from the export: the path
 * stayed relative, resolved against `about:blank`, and never loaded.
 *
 * `&` ends the path so the closing `&quot;` is not swallowed into it.
 */
export const UPLOAD_REF_RE =
  /(?:src=(?:["']|&quot;|&#39;)|url\((?:["']|&quot;|&#39;)?)(\/uploads\/[^"'\s)&]+)/g;

/** The distinct `/uploads/…` paths `html` refers to, in first-seen order. */
export function findUploadRefs(html: string): string[] {
  return [...new Set([...html.matchAll(UPLOAD_REF_RE)].map((m) => m[1]))];
}

/**
 * The file on disk an `/uploads/…` reference points at, or null when it
 * resolves outside `public/uploads`. The regex above happily matches
 * `/uploads/../../package.json`, and the exporter used to read whatever that
 * landed on and inline it into a document Chrome rendered.
 */
export function resolveUploadPath(publicDir: string, ref: string): string | null {
  const uploads = path.resolve(publicDir, "uploads");
  const full = path.resolve(publicDir, "." + ref);
  return full.startsWith(uploads + path.sep) ? full : null;
}

/**
 * A reference image or chat attachment URL: one image directly in uploads.
 * The agent is told to `Read` the file it maps to, so `/uploads/../../x` here
 * used to mean "read any file on this machine".
 */
const UPLOAD_IMAGE_URL_RE = /^\/uploads\/[\w-]+\.(png|jpe?g|webp)$/;

export function isUploadImageUrl(url: unknown): url is string {
  return typeof url === "string" && UPLOAD_IMAGE_URL_RE.test(url);
}

/** Where a validated upload URL lives on disk. Derived, never stored. */
export function uploadImagePath(url: string): string {
  return path.resolve(process.cwd(), "public", url.slice(1));
}
