import { NextResponse } from "next/server";
import { duplicateSlide } from "@/lib/carousels";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; slideId: string }> }
) {
  const { id, slideId } = await params;
  const copy = await duplicateSlide(id, slideId);
  if (!copy) {
    return NextResponse.json(
      { error: "Slide not found or the carousel already has the maximum number of slides" },
      { status: 400 }
    );
  }
  return NextResponse.json(copy, { status: 201 });
}
