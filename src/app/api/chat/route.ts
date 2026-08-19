import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import crossSpawn from "cross-spawn";
import { getClaudePath, isClaudeAvailable } from "@/lib/claude-path";
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

// child.kill() on Windows leaves the CLI's own children (bash, curl) orphaned,
// and enough orphans starve the machine into the startup failure above.
// ponytail: taskkill shells out; a job object would be tidier if this gets hot.
function killTree(child: { pid?: number; kill: () => boolean }) {
  if (process.platform === "win32" && child.pid) {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
      }).on("error", () => {});
      return;
    } catch {
      // fall through to plain kill
    }
  }
  child.kill();
}

export async function POST(request: NextRequest) {
  if (!isClaudeAvailable()) {
    return NextResponse.json(
      {
        error:
          "Claude CLI not found. Install from https://docs.anthropic.com/en/docs/claude-code or set CLAUDE_CLI_PATH in .env.local",
      },
      { status: 503 }
    );
  }

  let body: {
    message?: string;
    sessionId?: string;
    carouselId?: string;
    stylePresetId?: string;
    attachments?: Array<{ url?: string; name?: string }>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message, sessionId, carouselId, stylePresetId, attachments } = body;

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
  const systemPrompt = buildSystemPrompt(brand, carousel, stylePreset);

  const claudePath = getClaudePath();
  const abortController = new AbortController();

  const args = [
    "-p",
    promptText,
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--append-system-prompt",
    systemPrompt,
    "--allowedTools",
    "Bash",
    "WebFetch",
    "Read",
    "--max-budget-usd",
    // A full carousel runs ~250k tokens; 1.00 dies mid-build.
    process.env.CHAT_MAX_BUDGET_USD || "5.00",
    "--name",
    "carrusel-chat",
  ];

  if (sessionId) {
    args.push("--resume", sessionId);
  }

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
        process.platform === "win32" && /\.(cmd|bat)$/i.test(claudePath);
      const spawner = isWindowsShim ? crossSpawn : spawn;

      let buffer = "";
      let resolvedSessionId = sessionId ?? "";
      let sawOutput = false;

      const launch = (attempt: number) => {
        let childProcess: ReturnType<typeof spawn>;

        try {
          childProcess = spawner(claudePath, args, {
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
          // Close stdin — we don't send input to the subprocess
          childProcess.stdin?.end();
        } catch (err) {
          const e = err as NodeJS.ErrnoException;
          console.error(`[chat] failed to spawn Claude CLI ${JSON.stringify({
            claudePath,
            platform: process.platform,
            code: e?.code,
            message: e?.message,
          })}`);
          send(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({
                error: "Failed to start Claude CLI",
                code: e?.code,
                path: claudePath,
                message: e?.message,
              })}\n\n`
            )
          );
          close();
          return;
        }

        childProcess.stdout?.on("data", (chunk: Buffer) => {
          sawOutput = true;
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line);
              handleEvent(event, send, encoder, (id) => {
                resolvedSessionId = id;
              });
            } catch {
              // skip unparseable lines
            }
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
          console.error(`[chat] Claude subprocess error ${JSON.stringify({
            claudePath,
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
              `[chat] Windows failed to start Claude CLI (0x${(code as number >>> 0).toString(16)}), retrying once`
            );
            setTimeout(() => launch(attempt + 1), 250);
            return;
          }

          // process remaining buffer
          if (buffer.trim()) {
            try {
              const event = JSON.parse(buffer);
              handleEvent(event, send, encoder, (id) => {
                resolvedSessionId = id;
              });
            } catch {
              // skip
            }
          }

          if (code && code !== 0) {
            console.error(`[chat] Claude subprocess exited non-zero ${JSON.stringify({
              claudePath,
              platform: process.platform,
              exitCode: code,
              stderr: stderrBuf,
            })}`);
            try {
              send(
                encoder.encode(
                  `event: error\ndata: ${JSON.stringify({
                    error: isWindowsStartupFailure(code)
                      ? `Windows no pudo iniciar el Claude CLI (0x${(code >>> 0).toString(16)}). Suele ser falta de memoria o demasiados procesos abiertos: cerrá apps, reiniciá el dev server desde una terminal normal y probá de nuevo.`
                      : `Claude CLI exited with code ${code}`,
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

function handleEvent(
  event: Record<string, unknown>,
  send: (payload: Uint8Array) => void,
  encoder: TextEncoder,
  onSessionId: (id: string) => void
) {
  // Extract session ID from init event
  if (
    event.type === "system" &&
    event.subtype === "init" &&
    event.session_id
  ) {
    onSessionId(event.session_id as string);
    return;
  }

  // Extract streaming text tokens
  if (event.type === "assistant" && event.message) {
    const msg = event.message as Record<string, unknown>;
    if (msg.type === "message" && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") {
          send(
            encoder.encode(
              `data: ${JSON.stringify({ type: "token", text: b.text })}\n\n`
            )
          );
        }
      }
    }
    return;
  }

  // Extract result with session ID
  if (event.type === "result") {
    if (event.session_id) {
      onSessionId(event.session_id as string);
    }
    if (event.is_error || (event.subtype && event.subtype !== "success")) {
      send(
        encoder.encode(
          `event: error\ndata: ${JSON.stringify({
            error:
              typeof event.result === "string" && event.result
                ? event.result
                : `Claude CLI stopped: ${event.subtype}`,
            subtype: event.subtype,
          })}\n\n`
        )
      );
      return;
    }
    if (typeof event.result === "string" && event.result) {
      send(
        encoder.encode(
          `data: ${JSON.stringify({ type: "result", text: event.result })}\n\n`
        )
      );
    }
    return;
  }
}
