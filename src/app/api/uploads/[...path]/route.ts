import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { resolveUploadPath } from "@/lib/upload-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: parts } = await params;
  const ref = `/uploads/${parts.join("/")}`;
  const file = resolveUploadPath(PUBLIC_DIR, ref);
  const type = CONTENT_TYPES[path.extname(ref).toLowerCase()];
  if (!file || !type || ref.includes("\0")) return new Response(null, { status: 404 });

  try {
    // The lexical check above also needs to hold after resolving symlinks.
    const root = await realpath(path.join(PUBLIC_DIR, "uploads"));
    const full = await realpath(file);
    if (!full.startsWith(root + path.sep)) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(await readFile(full)), {
      headers: { "Content-Type": type, "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (["ENOENT", "ENOTDIR", "EISDIR", "EINVAL"].includes((error as NodeJS.ErrnoException).code ?? "")) {
      return new Response(null, { status: 404 });
    }
    console.error("Upload read error:", error);
    return Response.json({ error: "Couldn't read the upload" }, { status: 500 });
  }
}
