import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { ENGINES, findEnginePath, runEngineOnce } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UPLOAD_DIR = path.resolve(process.cwd(), "public/uploads");

// gpt-image-2 takes flexible sizes, but an open field invites the model to
// invent something the API rejects mid-carousel. These cover every slide use.
const SIZES = new Set([
  "1024x1024",
  "1024x1536",
  "1536x1024",
  "1080x1080",
  "1080x1350",
  "1080x1920",
]);

export async function POST(request: NextRequest) {
  const engine = ENGINES.codex;
  if (!findEnginePath(engine)) {
    return NextResponse.json(
      {
        error:
          "Image generation needs the Codex CLI. Install it (npm i -g @openai/codex), run `codex login`, or set CODEX_CLI_PATH in .env.local",
      },
      { status: 503 }
    );
  }

  let body: { prompt?: string; size?: string; transparent?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || prompt.length > 2000) {
    return NextResponse.json(
      { error: "prompt is required (1-2000 chars)" },
      { status: 400 }
    );
  }

  const size = body.size && SIZES.has(body.size) ? body.size : "1024x1024";
  const transparent = body.transparent !== false;

  // The filename is ours, never the caller's — this path is handed to a shell.
  const name = `gen-${crypto.randomUUID()}.png`;
  const absPath = path.join(UPLOAD_DIR, name);
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const instruction = `Generate exactly one image with your built-in image generation tool.

Subject: ${prompt}

Size: ${size} pixels.
Background: ${transparent ? "fully transparent (preserve the alpha channel)" : "opaque"}.
Do not render any text, letters, numbers or watermark inside the image.

The tool saves its output under $CODEX_HOME. After it finishes, copy that file to
exactly this path, creating no other files:

${absPath}

Then reply with the single word DONE. Do not explain, do not generate variants.`;

  const result = await runEngineOnce(
    engine,
    { prompt: instruction, systemPrompt: "" },
    280_000
  );

  // The CLI's own exit code is not proof of anything — check for the file.
  try {
    const meta = await sharp(absPath).metadata();
    return NextResponse.json({
      url: `/uploads/${name}`,
      width: meta.width ?? null,
      height: meta.height ?? null,
      hasAlpha: meta.hasAlpha ?? false,
    });
  } catch {
    console.error(
      `[images] generation produced no file ${JSON.stringify({
        exitCode: result.exitCode,
        text: result.text.slice(0, 500),
        stderr: result.stderr.slice(0, 500),
      })}`
    );
    return NextResponse.json(
      {
        error: "Image generation failed",
        detail: result.stderr.slice(-400) || result.text.slice(-400) || undefined,
      },
      { status: 502 }
    );
  }
}
