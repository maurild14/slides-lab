import os from "os";
import path from "path";
import { writeFile } from "fs/promises";
import type { Slide, Carousel, AspectRatio } from "@/types/carousel";
import { DIMENSIONS } from "@/types/carousel";
import {
  buildSlideDocument,
  exportAllSlides,
  getBrowser,
} from "./export-slides";
import { getCarousel } from "./carousels";
import { findIssues, type MeasuredBox } from "./slide-audit-rules";

export { findIssues, type MeasuredBox } from "./slide-audit-rules";

/**
 * What the agent gets back after writing a slide.
 *
 * The agent writes HTML blind: it never sees the render, so every design rule
 * in the system prompt is guesswork. `warnings` is the objective half of the
 * answer (measured, cannot hallucinate) and `pngPath` the subjective half —
 * the agent reads the image to judge whether it actually looks good.
 */
export interface SlideAudit {
  warnings: string[];
  pngPath: string;
}

/** Read every element the user could click, as laid out. Runs in the page. */
function collectBoxes(): MeasuredBox[] {
  // The prompt asks for one root div holding every element as a direct child,
  // but a slide written before that rule (or by hand) can put them on body.
  const kids = Array.from(document.body.children);
  const root =
    kids.length === 1 && kids[0].children.length > 0 ? kids[0] : document.body;

  return Array.from(root.children).map((el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const painted =
      s.backgroundColor !== "rgba(0, 0, 0, 0)" ||
      s.backgroundImage !== "none" ||
      parseFloat(s.borderTopWidth) > 0;
    return {
      name: el.getAttribute("data-oc-name") || "",
      text: (el.textContent || "").replace(/\s+/g, " ").trim(),
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      scrollWidth: el.scrollWidth,
      scrollHeight: el.scrollHeight,
      painted,
      childCount: el.children.length,
    };
  });
}

/**
 * Render the slide once, then take both answers off that same page: the PNG
 * the agent looks at and the measurements it reasons about. One render, not
 * two — a second pass would double the cost to say the same thing.
 */
export async function auditSlide(
  slide: Slide,
  aspectRatio: AspectRatio
): Promise<SlideAudit> {
  const { width, height } = DIMENSIONS[aspectRatio];
  const fullHtml = await buildSlideDocument(slide.html, aspectRatio);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(fullHtml, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    // Text metrics decide every overflow below, so the real faces have to be
    // in before anything is measured.
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    // Only the foreground tab is composited; without this the capture waits on
    // a frame that never arrives. Same reason as the exporter.
    await page.bringToFront();

    const png = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    const boxes = (await page.evaluate(collectBoxes)) as MeasuredBox[];

    // os.tmpdir(), never the project: the dev server watches it and a write
    // reloads the page, killing the chat stream mid-answer. Fixed name per
    // slide so re-auditing overwrites instead of piling up.
    const pngPath = path.join(os.tmpdir(), `oc-slide-${slide.id}.png`);
    await writeFile(pngPath, png);

    return { warnings: findIssues(boxes, width, height), pngPath };
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Audit a slide by carousel id, for the API routes.
 *
 * Never throws: the slide is already saved by the time this runs, and a
 * headless Chrome that failed to start is no reason to report the write as a
 * failure. Warnings are advice, not a gate.
 */
export async function auditForCarousel(
  carouselId: string,
  slide: Slide
): Promise<Partial<SlideAudit>> {
  try {
    const carousel = await getCarousel(carouselId);
    if (!carousel) return {};
    return await auditSlide(slide, carousel.aspectRatio);
  } catch {
    return {};
  }
}

/**
 * Every slide of the carousel as one image, four to a row.
 *
 * The agent sees one slide at a time and so never catches what only exists in
 * the set: three slides sharing a layout, one that breaks the palette, titles
 * that shrink for no reason. A contact sheet is how a photographer looks at a
 * whole roll instead of one frame.
 */
export async function contactSheet(carousel: Carousel): Promise<string> {
  const { width, height } = DIMENSIONS[carousel.aspectRatio];
  const pngs = await exportAllSlides(carousel.slides, carousel.aspectRatio);

  const COLS = 4;
  const CELL = 320;
  const GAP = 16;
  const LABEL = 34;
  const cellH = Math.round((CELL * height) / width);
  const rows = Math.ceil(pngs.length / COLS);
  const sheetW = COLS * CELL + (COLS + 1) * GAP;
  const sheetH = rows * (cellH + LABEL) + (rows + 1) * GAP;

  const cells = pngs
    .map(
      (p, i) =>
        `<figure><figcaption>${i + 1}</figcaption><img src="data:image/png;base64,${p.buffer.toString("base64")}"></figure>`
    )
    .join("");

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: sheetW, height: sheetH });
    await page.setContent(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        * { margin: 0; padding: 0; box-sizing: border-box }
        body { width: ${sheetW}px; background: #52525b; padding: ${GAP}px;
               display: grid; grid-template-columns: repeat(${COLS}, ${CELL}px);
               gap: ${GAP}px; font: 600 20px system-ui, sans-serif }
        figcaption { height: ${LABEL}px; color: #fff; line-height: ${LABEL}px }
        img { display: block; width: ${CELL}px; height: ${cellH}px }
      </style></head><body>${cells}</body></html>`,
      { waitUntil: "domcontentloaded", timeout: 30000 }
    );
    await page.bringToFront();
    const png = await page.screenshot({ type: "png", fullPage: true });

    const sheetPath = path.join(os.tmpdir(), `oc-sheet-${carousel.id}.png`);
    await writeFile(sheetPath, png);
    return sheetPath;
  } finally {
    await page.close().catch(() => {});
  }
}
