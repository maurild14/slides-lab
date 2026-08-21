import puppeteer, { type Browser } from "puppeteer";
import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { wrapSlideHtml, extractFontFamilies } from "./slide-html";
import { getInlinedFontCSS } from "./fonts";
import type { Slide, AspectRatio } from "@/types/carousel";
import { DIMENSIONS } from "@/types/carousel";

// Singleton browser with lifecycle management
let browser: Browser | null = null;
let exportCount = 0;
const MAX_EXPORTS_BEFORE_RESTART = 50;

async function getBrowser(): Promise<Browser> {
  if (browser && exportCount >= MAX_EXPORTS_BEFORE_RESTART) {
    await browser.close().catch(() => {});
    browser = null;
    exportCount = 0;
  }
  if (!browser || !browser.isConnected()) {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
    exportCount = 0;
  }
  return browser;
}

/**
 * Inline all image references in slide HTML.
 * Replaces /uploads/xxx.png paths with data: URIs.
 */
async function inlineImages(html: string): Promise<string> {
  const uploadDir = path.resolve(process.cwd(), "public");
  const imgRegex = /(?:src=["']|url\(["']?)(\/uploads\/[^"'\s)]+)/g;
  const matches = [...html.matchAll(imgRegex)];

  let result = html;
  for (const match of matches) {
    const imgPath = match[1];
    try {
      const fullPath = path.join(uploadDir, imgPath);
      const buffer = await readFile(fullPath);
      const ext = path.extname(imgPath).toLowerCase();
      const mime =
        ext === ".png"
          ? "image/png"
          : ext === ".jpg" || ext === ".jpeg"
            ? "image/jpeg"
            : "image/webp";
      const base64 = buffer.toString("base64");
      result = result.replace(imgPath, `data:${mime};base64,${base64}`);
    } catch {
      // Keep original path — Puppeteer can fetch from localhost
    }
  }

  return result;
}

export type ExportFormat = "png" | "jpg" | "png-transparent" | "pdf";

export interface ExportOptions {
  format?: ExportFormat;
  /** JPG only, 1-100. */
  quality?: number;
}

export const FILE_EXT: Record<ExportFormat, string> = {
  png: "png",
  "png-transparent": "png",
  jpg: "jpg",
  pdf: "pdf",
};

export const MIME: Record<ExportFormat, string> = {
  png: "image/png",
  "png-transparent": "image/png",
  jpg: "image/jpeg",
  pdf: "application/pdf",
};

/**
 * Export a single slide to an image buffer.
 *
 * `png-transparent` asks Chrome to skip the default white backdrop. It only
 * produces holes where the slide itself paints nothing — a slide whose root
 * div has a background colour still comes out opaque, which is the honest
 * result.
 */
export async function exportSlide(
  slide: Slide,
  aspectRatio: AspectRatio,
  options: ExportOptions = {}
): Promise<Buffer> {
  const { format = "png", quality = 90 } = options;
  const { width, height } = DIMENSIONS[aspectRatio];

  // Get inlined font CSS
  const fontFamilies = extractFontFamilies(slide.html);
  const inlinedFontCss = await getInlinedFontCSS(fontFamilies);

  // Inline images
  const inlinedHtml = await inlineImages(slide.html);

  // Build self-contained HTML
  const fullHtml = wrapSlideHtml(inlinedHtml, aspectRatio, {
    inlineFontCss: inlinedFontCss,
  });

  const br = await getBrowser();
  const page = await br.newPage();

  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(fullHtml, { waitUntil: "domcontentloaded", timeout: 15000 });

    // Wait for the fonts this page actually uses.
    //
    // This used to also require every registered face to report "loaded",
    // which can never happen: the inlined CSS declares six weights and a slide
    // uses two, so the unused faces stay pending forever and the wait burned
    // its full 10s timeout on every single slide.
    await page.evaluate(() => document.fonts.ready).catch(() => {
      // Proceed with whatever loaded rather than failing the export.
    });

    // Only the foreground tab is composited. Without this the capture below
    // waits for a frame that a background page will never produce.
    await page.bringToFront();

    const screenshotBuffer = await page.screenshot({
      type: "png",
      omitBackground: format === "png-transparent",
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });

    exportCount++;

    // Post-process with Sharp: enforce sRGB
    const pipeline = sharp(screenshotBuffer).toColorspace("srgb");
    return format === "jpg"
      ? await pipeline
          // JPG has no alpha; without a flatten the transparent pixels of a
          // cut-out slide come out black.
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: Math.min(100, Math.max(1, Math.round(quality))) })
          .toBuffer()
      : await pipeline.png().toBuffer();
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Export all slides of a carousel to PNG buffers.
 *
 * Strictly one at a time. This used to render three slides in parallel, which
 * is slower *and* broken: Chrome composites only the foreground tab, so two of
 * every three captures waited on a frame that was never coming and died on the
 * protocol timeout three minutes later. Sequentially, with the page brought to
 * the front, a full eight-slide carousel exports in under two seconds.
 */
export async function exportAllSlides(
  slides: Slide[],
  aspectRatio: AspectRatio,
  options: ExportOptions = {},
  onProgress?: (current: number, total: number) => void
): Promise<{ name: string; buffer: Buffer }[]> {
  const ext = FILE_EXT[options.format ?? "png"];
  const results: { name: string; buffer: Buffer }[] = [];

  for (let idx = 0; idx < slides.length; idx++) {
    const buffer = await exportSlide(slides[idx], aspectRatio, options);
    onProgress?.(idx + 1, slides.length);
    results.push({ name: `slide-${idx + 1}.${ext}`, buffer });
  }

  return results;
}

/**
 * The whole carousel as one PDF, one slide per page.
 *
 * ponytail: the slides are rendered to PNG first and then laid into a page of
 * <img> tags, rather than printing each slide document directly. Printing the
 * live document re-runs layout under print media, where a `100vh` block or a
 * viewport unit silently lands somewhere else; a bitmap cannot drift. The
 * cost is a raster PDF — swap in a real vector print if selectable text in the
 * PDF ever matters.
 */
export async function exportCarouselPdf(
  slides: Slide[],
  aspectRatio: AspectRatio,
  onProgress?: (current: number, total: number) => void
): Promise<Buffer> {
  const { width, height } = DIMENSIONS[aspectRatio];

  const pages: string[] = [];
  for (let idx = 0; idx < slides.length; idx++) {
    const png = await exportSlide(slides[idx], aspectRatio, { format: "png" });
    onProgress?.(idx + 1, slides.length);
    pages.push(
      `<img src="data:image/png;base64,${png.toString("base64")}" width="${width}" height="${height}">`
    );
  }

  const br = await getBrowser();
  const page = await br.newPage();
  try {
    await page.setContent(
      `<!DOCTYPE html><html><head><style>
        @page { size: ${width}px ${height}px; margin: 0 }
        * { margin: 0; padding: 0 }
        img { display: block; width: ${width}px; height: ${height}px; break-after: page }
        img:last-child { break-after: auto }
      </style></head><body>${pages.join("")}</body></html>`,
      { waitUntil: "domcontentloaded", timeout: 30000 }
    );
    const pdf = await page.pdf({
      width: `${width}px`,
      height: `${height}px`,
      printBackground: true,
      pageRanges: `1-${slides.length}`,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}
