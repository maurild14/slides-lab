import { NextResponse } from "next/server";
import { addSlide, reorderSlides, getCarousel } from "@/lib/carousels";
import { auditForCarousel } from "@/lib/slide-audit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { html, notes } = body as { html?: string; notes?: string };

    if (!html || typeof html !== "string") {
      return NextResponse.json(
        { error: "HTML content is required" },
        { status: 400 }
      );
    }

    const slide = await addSlide(id, html, notes);
    if (!slide) {
      return NextResponse.json(
        { error: "Carousel not found or max slides reached" },
        { status: 400 }
      );
    }

    // Creating a slide is the agent's move, so it always gets measured. Pass
    // ?audit=0 to skip the render when the caller has nothing to learn from it.
    const audit =
      new URL(request.url).searchParams.get("audit") === "0"
        ? {}
        : await auditForCarousel(id, slide);
    return NextResponse.json({ ...slide, ...audit }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { slideIds } = body as { slideIds?: string[] };

    if (!Array.isArray(slideIds)) {
      return NextResponse.json(
        { error: "slideIds array is required" },
        { status: 400 }
      );
    }

    const success = await reorderSlides(id, slideIds);
    if (!success) {
      return NextResponse.json(
        { error: "Carousel not found or invalid slide IDs" },
        { status: 400 }
      );
    }

    const carousel = await getCarousel(id);
    return NextResponse.json({ slides: carousel?.slides ?? [] });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
