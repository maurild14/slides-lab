import { NextResponse } from "next/server";
import { addReferenceImage, removeReferenceImage, getCarousel } from "@/lib/carousels";
import { generateId, now } from "@/lib/utils";
import { isUploadImageUrl } from "@/lib/upload-paths";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const carousel = await getCarousel(id);
  if (!carousel) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ references: carousel.referenceImages || [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { url, name } = body as { url?: string; name?: string };

    if (!isUploadImageUrl(url)) {
      return NextResponse.json(
        { error: "url must be an image in /uploads/ (png, jpg or webp)" },
        { status: 400 }
      );
    }

    const ref = {
      id: generateId(),
      url,
      name: typeof name === "string" && name ? name : "Reference image",
      addedAt: now(),
    };

    const result = await addReferenceImage(id, ref);
    if (!result) {
      return NextResponse.json({ error: "Carousel not found" }, { status: 404 });
    }

    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get("imageId");
    if (!imageId) {
      return NextResponse.json({ error: "imageId is required" }, { status: 400 });
    }

    const deleted = await removeReferenceImage(id, imageId);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
