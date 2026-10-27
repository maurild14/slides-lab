import { NextResponse } from "next/server";
import { getCarousel, updateCarousel, deleteCarousel } from "@/lib/carousels";
import type { Carousel } from "@/types/carousel";
import {
  either,
  isObjectArray,
  isString,
  isStringArray,
  oneOf,
  pickFields,
} from "@/lib/pick-fields";

// Everything a client may change. `slides`, `referenceImages`, `id` and the
// timestamps have their own routes or are server-owned.
const EDITABLE = {
  name: isString,
  aspectRatio: oneOf("1:1", "4:5", "9:16"),
  tags: isStringArray,
  chatSessionId: either(isString, oneOf(null)),
  chatMessages: isObjectArray,
  caption: isString,
  hashtags: isStringArray,
  designPlan: isString,
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const carousel = await getCarousel(id);
  if (!carousel) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(carousel);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const updates = pickFields<Carousel>(await request.json(), EDITABLE);
    if (!updates) {
      return NextResponse.json({ error: "Invalid fields" }, { status: 400 });
    }
    const updated = await updateCarousel(id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deleted = await deleteCarousel(id);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
