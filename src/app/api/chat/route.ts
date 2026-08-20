import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import crossSpawn from "cross-spawn";
import {
  type AgentEvent,
  type EngineId,
  findEnginePath,
  getEngine,
  killTree,
} from "@/lib/agents";
import { buildSystemPrompt } from "@/lib/chat-system-prompt";
import { getBrand } from "@/lib/brand";
import { getCarousel } from "@/lib/carousels";
import { getPreset } from "@/lib/style-presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Windows reports a failed process *startup* as an NT status code (>= 0xC0000000),
// e.g. 3221225794 = 0xC0000142 STATUS_DLL_INIT_FAILED. The CLI never ran: the OS
// refused to map it, usually because the machine is memory-starved or the dev
// server sits inside a restricted job object. A clean retry usually succeeds.
function isWindowsStartupFailure(code: number | null): boolean {
  return process.platform === "win32" && code !== null && code >>> 0 >= 0xc0000000;
}

export async function POST(request: NextRequest) {
  let body: {
    message?: string;
    sessionId?: string;
    carouselId?: string;
    stylePresetId?: string;
    engine?: EngineId;
    attachments?: Array<{ url?: string; name?: string }>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message, sessionId, carouselId, stylePresetId, attachments } = body;

  const engine = getEngine(body.engine);
  const enginePath = findEnginePath(engine);
  if (!enginePath) {
    return NextResponse.json(
      {
        error: `${engine.label} CLI not found. Install it or set ${engine.envVar} in .env.local`,
      },
      { status: 503 }
    );
  }

  const safeAttachments = Array.isArray(attachments)
    ? attachments
        .filter(
          (a): a is { url: string; name?: string } =>
            !!a && typeof a.url === "string" && a.url.startsWith("/uploads/")
        )
        .slice(0, 8)
    : [];

  if (
    typeof message !== "string" ||
    (!message.trim() && safeAttachments.length === 0) ||
    message.length > 50000
  ) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  // Build the prompt text. If attachments are present, append absolute paths
  // so Claude (which has the Read tool allowed) can view them as references
  // for this single user turn.
  let promptText = message.trim();
  if (safeAttachments.length > 0) {
    const lines = safeAttachments.map((a, i) => {
      const absPath = path.resolve(
        process.cwd(),
        "public",
        a.url.replace(/^\//, "")
      );
      const label = a.name ? ` — ${a.name}` : "";
      return `  ${i + 1}. ${absPath}${label}`;
    });
    const intro = promptText
      ? "\n\n## Attached images for this message\nThe user attached the following image(s). Use the Read tool to view each one and let them inform your response (style, content, references, etc.):\n"
      : "## Attached images for this message\nThe user attached the following image(s) without a text message. Use the Read tool to view each one and respond based on what you see:\n";
    promptText = `${promptText}${intro}${lines.join("\n")}`;
  }

  // Build dynamic system prompt with current brand + carousel + style preset context
  const brand = await getBrand();
  const carousel = carouselId ? await getCarousel(carouselId) : null;
  const stylePreset = stylePresetId ? await getPreset(stylePresetId) : null;
  const systemPrompt = buildSystemPrompt(brand, carousel, stylePreset, engine.id);

  const abortController = new AbortController();

  const { args, stdin } = engine.buildLaunch({
    prompt: promptText,
    systemPrompt,
    sessionId,
  });

  const encoder = new TextEncoder();

  // The client can vanish mid-stream (tab reload, HMR, "Stop generating").
  // After that writing to the controller throws, and because we write from
  // subprocess event handlers the throw is uncaught and kills the Next dev
  // server worker ("Jest worker encountered N child process exceptions").
  let closed = false;
  let child: ReturnType<typeof spawn> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(payload);
        } catch {
          // client is gone: stop writing, stop the subprocess
          closed = true;
          if (child) killTree(child);
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by the runtime
        }
      };

      const isWindowsShim =
        process.platform === "win32" && /\.(cmd|bat)$/i.test(enginePath);
      const spawner = isWindowsShim ? crossSpawn : spawn;

      let buffer = "";
      let resolvedSessionId = sessionId ?? "";
      let sawOutput = false;

      const launch = (attempt: number) => {
        let childProcess: ReturnType<typeof spawn>;
        const parse = engine.createParser();

        try {
          childProcess = spawner(enginePath, args, {
            cwd: process.cwd(),
            signal: abortController.signal,
            stdio: ["pipe", "pipe", "pipe"],
          });
          child = childProcess;
          // Pipes must have error listeners: if the CLI dies early, closing stdin
          // raises EPIPE asynchronously, which is an uncaughtException that takes
          // the whole Next dev server down.
          childProcess.stdin?.on("error", () => {});
          childProcess.stdout?.on("error", () => {});
          childProcess.stderr?.on("error", () => {});
          if (stdin) childProcess.stdin?.write(stdin);
          childProcess.stdin?.end();
        } catch (err) {
          const e = err as NodeJS.ErrnoException;
          console.error(`[chat] failed to spawn ${engine.label} CLI ${JSON.stringify({
            enginePath,
            platform: process.platform,
            code: e?.code,
            message: e?.message,
          })}`);
          send(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({
                error: `Failed to start ${engine.label} CLI`,
                code: e?.code,
                path: enginePath,
                message: e?.message,
              })}\n\n`
            )
          );
          close();
          return;
        }

        const emit = (line: string) => {
          for (const event of parse(line)) {
            if (event.type === "session") {
              resolvedSessionId = event.id;
              continue;
            }
            send(encoder.encode(toSse(event)));
          }
        };

        childProcess.stdout?.on("data", (chunk: Buffer) => {
          sawOutput = true;
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.trim()) emit(line);
          }
        });

        let stderrBuf = "";
        const STDERR_CAP = 8192;
        childProcess.stderr?.on("data", (chunk: Buffer) => {
          if (stderrBuf.length < STDERR_CAP) {
            stderrBuf = (stderrBuf + chunk.toString()).slice(-STDERR_CAP);
          }
        });

        // Timeout: kill subprocess after 8 minutes (autonomous mode creates many slides)
        const timeout = setTimeout(() => {
          killTree(childProcess);
        }, 480_000);

        childProcess.on("error", (err) => {
          clearTimeout(timeout);
          const e = err as NodeJS.ErrnoException;
          console.error(`[chat] ${engine.label} subprocess error ${JSON.stringify({
            enginePath,
            platform: process.platform,
            code: e?.code,
            syscall: e?.syscall,
            path: e?.path,
            message: e?.message,
            stderr: stderrBuf,
          })}`);
          try {
            killTree(childProcess);
            send(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({
                  error: err.message,
                  code: e?.code,
                  syscall: e?.syscall,
                  path: e?.path,
                  stderr: stderrBuf || undefined,
                })}\n\n`
              )
            );
            close();
          } catch {
            // stream already closed
          }
        });

        childProcess.on("exit", (code) => {
          clearTimeout(timeout);

          // Windows refused to start the process — nothing ran, so retry once.
          if (attempt === 0 && !sawOutput && isWindowsStartupFailure(code)) {
            console.warn(
              `[chat] Windows failed to start ${engine.label} CLI (0x${(code as number >>> 0).toString(16)}), retrying once`
            );
            setTimeout(() => launch(attempt + 1), 250);
            return;
          }

          // process remaining buffer
          if (buffer.trim()) emit(buffer);

          if (code && code !== 0) {
            console.error(`[chat] ${engine.label} subprocess exited non-zero ${JSON.stringify({
              enginePath,
              platform: process.platform,
              exitCode: code,
              stderr: stderrBuf,
            })}`);
            try {
              send(
                encoder.encode(
                  `event: error\ndata: ${JSON.stringify({
                    error: isWindowsStartupFailure(code)
                      ? `Windows no pudo iniciar el ${engine.label} CLI (0x${(code >>> 0).toString(16)}). Suele ser falta de memoria o demasiados procesos abiertos: cerrá apps, reiniciá el dev server desde una terminal normal y probá de nuevo.`
                      : `${engine.label} CLI exited with code ${code}`,
                    exitCode: code,
                    stderr: stderrBuf || undefined,
                  })}\n\n`
                )
              );
            } catch {
              // stream already closed
            }
          }

          try {
            send(
              encoder.encode(
                `event: done\ndata: ${JSON.stringify({
                  sessionId: resolvedSessionId,
                  exitCode: code,
                })}\n\n`
              )
            );
            close();
          } catch {
            // stream already closed
          }
        });
      };

      launch(0);
    },

    cancel() {
      closed = true;
      abortController.abort();
      if (child) killTree(child);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/** Normalized agent event → the SSE frame the chat client already understands. */
function toSse(event: Exclude<AgentEvent, { type: "session" }>): string {
  if (event.type === "error") {
    return `event: error\ndata: ${JSON.stringify({
      error: event.error,
      subtype: event.subtype,
    })}\n\n`;
  }
  return `data: ${JSON.stringify(event)}\n\n`;
}
