import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.resolve(process.cwd(), "public/uploads");
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const LIMIT = 24;

/**
 * Recent images available to drop onto a slide.
 * ponytail: the filesystem is the index — no JSON registry. Add one if you ever
 * want the prompt that produced each image kept alongside it.
 */
export async function GET() {
  try {
    const entries = await fs.readdir(UPLOAD_DIR, { withFileTypes: true });
    const files = entries.filter(
      (e) => e.isFile() && IMAGE_EXT.has(path.extname(e.name).toLowerCase())
    );

    const withTime = await Promise.all(
      files.map(async (e) => {
        const stat = await fs.stat(path.join(UPLOAD_DIR, e.name));
        return { url: `/uploads/${e.name}`, name: e.name, mtime: stat.mtimeMs };
      })
    );

    withTime.sort((a, b) => b.mtime - a.mtime);
    return NextResponse.json({ images: withTime.slice(0, LIMIT) });
  } catch {
    return NextResponse.json({ images: [] });
  }
}
