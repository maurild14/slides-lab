import { NextResponse } from "next/server";
import archiver from "archiver";
import { getCarousel } from "@/lib/carousels";
import {
  exportAllSlides,
  exportCarouselPdf,
  FILE_EXT,
  MIME,
  type ExportFormat,
} from "@/lib/export-slides";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const FORMATS: ExportFormat[] = ["png", "jpg", "png-transparent", "pdf"];

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]/g, "_") || "carousel";
}

function zip(files: { name: string; buffer: Buffer }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 5 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
    try {
      for (const { name, buffer } of files) archive.append(buffer, { name });
      archive.finalize();
    } catch (err) {
      archive.destroy();
      reject(err);
    }
  });
}

function download(buffer: Buffer, type: string, filename: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const carousel = await getCarousel(id);

  if (!carousel) {
    return NextResponse.json({ error: "Carousel not found" }, { status: 404 });
  }
  if (carousel.slides.length === 0) {
    return NextResponse.json({ error: "No slides to export" }, { status: 400 });
  }

  // A body is optional: the old no-argument POST still means "the whole
  // carousel as a ZIP of PNGs".
  const body = await request.json().catch(() => ({}));
  const { format = "png", quality = 90, slideId } = body as {
    format?: string;
    quality?: number;
    slideId?: string;
  };
  if (!FORMATS.includes(format as ExportFormat)) {
    return NextResponse.json({ error: `Unknown format: ${format}` }, { status: 400 });
  }
  const fmt = format as ExportFormat;

  const slides = slideId
    ? carousel.slides.filter((s) => s.id === slideId)
    : carousel.slides;
  if (slides.length === 0) {
    return NextResponse.json({ error: "Slide not found" }, { status: 404 });
  }

  const base = safeName(carousel.name);

  try {
    if (fmt === "pdf") {
      const pdf = await exportCarouselPdf(slides, carousel.aspectRatio);
      return download(pdf, MIME.pdf, `${base}.pdf`);
    }

    const files = await exportAllSlides(slides, carousel.aspectRatio, {
      format: fmt,
      quality,
    });

    // One slide is one file, not a one-item ZIP the user has to unpack.
    if (files.length === 1) {
      const index = carousel.slides.findIndex((s) => s.id === slides[0].id) + 1;
      return download(
        files[0].buffer,
        MIME[fmt],
        `${base}-slide-${index}.${FILE_EXT[fmt]}`
      );
    }

    return download(await zip(files), "application/zip", `${base}.zip`);
  } catch (error) {
    console.error("Export error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Export failed: ${message}` }, { status: 500 });
  }
}
