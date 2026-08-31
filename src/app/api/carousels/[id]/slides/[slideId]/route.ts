import { NextResponse } from "next/server";
import { updateSlide, deleteSlide } from "@/lib/carousels";
import { auditForCarousel } from "@/lib/slide-audit";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; slideId: string }> }
) {
  const { id, slideId } = await params;
  try {
    const body = await request.json();
    const slide = await updateSlide(id, slideId, body);
    if (!slide) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Opt-in, unlike POST: this is the autosave path. The canvas PUTs on every
    // finished gesture, and launching Chrome on each one would make dragging an
    // element feel broken.
    const audit =
      new URL(request.url).searchParams.get("audit") === "1"
        ? await auditForCarousel(id, slide)
        : {};
    return NextResponse.json({ ...slide, ...audit });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; slideId: string }> }
) {
  const { id, slideId } = await params;
  const deleted = await deleteSlide(id, slideId);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
