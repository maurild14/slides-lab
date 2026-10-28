import { NextResponse } from "next/server";
import { getCarousel } from "@/lib/carousels";
import { contactSheet } from "@/lib/slide-audit";

/**
 * The whole carousel as one image, for the agent to Read once it has finished
 * building. Nothing here is cached: it is asked for at the end of a build, and
 * the answer has to reflect the slides as they stand right then.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const carousel = await getCarousel(id);
  if (!carousel) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (carousel.slides.length === 0) {
    return NextResponse.json(
      { error: "The carousel has no slides yet" },
      { status: 400 }
    );
  }

  try {
    const path = await contactSheet(carousel);
    return NextResponse.json({ path, slides: carousel.slides.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Render failed" },
      { status: 500 }
    );
  }
}
