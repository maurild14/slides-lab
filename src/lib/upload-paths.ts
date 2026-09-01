/**
 * Finding `/uploads/…` references in slide HTML.
 *
 * Import-free on purpose, like `slide-audit-rules.ts`: the self-check runs it
 * under plain node, which resolves neither the `@/` alias nor puppeteer.
 */

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
