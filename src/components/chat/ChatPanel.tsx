"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput, type ChatAttachment } from "./ChatInput";
import { ReferenceImages } from "./ReferenceImages";
import { EngineSelector } from "./EngineSelector";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AlertCircle, Plug } from "lucide-react";
import type { ChatMessage as Message, ReferenceImage } from "@/types/carousel";
import type { EngineId, EngineStatus } from "@/lib/agents";

/** ms → "45s" / "3:12", for the how-long-has-this-been-running clock. */
function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** 21230 -> "21,2k". The session total is the number people watch. */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",")}k`;
  return String(n);
}

type Usage = { tokens: number; planUsedPct?: number; planLabel?: string };

interface ChatPanelProps {
  carouselId: string;
  referenceImages?: ReferenceImage[];
  engines: EngineStatus[];
  /** Awaited before the request goes out: last chance to save manual edits. */
  onBeforeSend?: () => Promise<void>;
  onStreamStart?: () => void;
  onStreamEnd?: () => void;
  chatInputRef?: React.RefObject<HTMLTextAreaElement | null>;
  /**
   * The element the user has selected, handed to the agent as context so a
   * request can be "hacelo más grande" instead of a description of which
   * heading you mean.
   */
  context?: { label: string; html: string } | null;
  onClearContext?: () => void;
  /** Hosted inside a panel that already draws the title. */
  embedded?: boolean;
  /**
   * The panel stays mounted while another rail tab is open, so a stream in
   * progress survives the switch. This says whether it is on screen.
   */
  visible?: boolean;
}

export function ChatPanel({
  carouselId,
  engines,
  referenceImages = [],
  onBeforeSend,
  onStreamStart,
  onStreamEnd,
  chatInputRef,
  context,
  onClearContext,
  embedded = false,
  visible = true,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; at: number } | null>(
    null
  );
  const [now, setNow] = useState(() => Date.now());
  const [engine, setEngine] = useState<EngineId>("claude");
  // "" is the engine's own default: the CLI reads its own config and we pass
  // no flag. Both are validated again server-side before they reach argv.
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [usage, setUsage] = useState<Usage>({ tokens: 0 });
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Sessions are per engine: a Claude session id means nothing to Codex.
  const sessionKey = `chat-session-${carouselId}-${engine}`;
  const usageKey = `chat-usage-${carouselId}-${engine}`;
  // So is the model — `opus` means nothing to Codex and `gpt-6-astra` means
  // nothing to Claude. The effort levels do line up, but keying them the same
  // way keeps one rule for the whole panel.
  const modelKey = `chat-model-${carouselId}-${engine}`;
  const effortKey = `chat-effort-${carouselId}-${engine}`;
  const anyEngineAvailable = engines.some((e) => e.available);

  // The history lives with the carousel on disk, so it survives a reload and
  // a different browser. The old localStorage log is deliberately NOT read as
  // a fallback: it resurrected month-old conversations every time the stored
  // history happened to be empty.
  useEffect(() => {
    const storedEngine = localStorage.getItem(`chat-engine-${carouselId}`);
    if (storedEngine === "claude" || storedEngine === "codex") {
      setEngine(storedEngine);
    }

    let cancelled = false;
    setLoaded(false);
    (async () => {
      let history: Message[] = [];
      try {
        const res = await fetch(`/api/carousels/${carouselId}`);
        if (res.ok) history = (await res.json()).chatMessages ?? [];
      } catch {
        // offline: start empty rather than with an unrelated conversation
      }
      if (cancelled) return;
      // Never replace what is already on screen. A remount — Fast Refresh, a
      // parent that re-keys — would otherwise drop the live conversation and
      // show the stored one in its place.
      setMessages((prev) => (prev.length > 0 ? prev : history));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [carouselId]);

  // Follow the engine's own session when it (or the carousel) changes
  useEffect(() => {
    setSessionId(localStorage.getItem(sessionKey));
  }, [sessionKey]);

  // Tokens are a running total for the session, so they live where the session
  // id lives. The plan percentage is a live reading; the last one is kept only
  // so the line is not blank until the first turn of a reloaded page ends.
  useEffect(() => {
    try {
      setUsage(JSON.parse(localStorage.getItem(usageKey) ?? "") as Usage);
    } catch {
      setUsage({ tokens: 0 });
    }
  }, [usageKey]);

  // Follow the engine's own model and effort the same way the session does.
  useEffect(() => {
    setModel(localStorage.getItem(modelKey) ?? "");
    setEffort(localStorage.getItem(effortKey) ?? "");
  }, [modelKey, effortKey]);

  const handleEngineChange = useCallback(
    (next: EngineId) => {
      setEngine(next);
      localStorage.setItem(`chat-engine-${carouselId}`, next);
    },
    [carouselId]
  );

  const handleModelChange = useCallback(
    (next: string) => {
      setModel(next);
      localStorage.setItem(modelKey, next);
    },
    [modelKey]
  );

  const handleEffortChange = useCallback(
    (next: string) => {
      setEffort(next);
      localStorage.setItem(effortKey, next);
    },
    [effortKey]
  );

  // Save whenever the log settles. Debounced, so a stream writes once when it
  // stops instead of once per token.
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      fetch(`/api/carousels/${carouselId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatMessages: messages }),
      }).catch(() => {
        // a failed history write is not worth an error line in the chat
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [messages, loaded, carouselId]);

  const handleClearChat = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    localStorage.removeItem(`chat-messages-${carouselId}`);
    localStorage.removeItem(sessionKey);
    setUsage({ tokens: 0 });
    localStorage.removeItem(usageKey);
  }, [carouselId, sessionKey, usageKey]);

  const handleStopGenerating = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Auto-scroll to bottom. `visible` is a dependency because a hidden panel
  // has no scrollHeight: without it you come back from another tab to a
  // conversation scrolled to the top.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, visible]);

  // The stream goes fully silent while the model writes a long slide — 3.9 min
  // on a measured run — so the last status line looks frozen and the run looks
  // dead. A clock is the only thing that separates "slow" from "hung".
  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isStreaming]);

  const handleSend = useCallback(
    async (message: string, attachments: ChatAttachment[] = []) => {
      if (isStreaming) return;
      setError(null);
      setIsStreaming(true);
      await onBeforeSend?.();
      onStreamStart?.();

      // Add user message
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: message,
        attachments: attachments.length > 0 ? attachments : undefined,
      };
      setMessages((prev) => [...prev, userMsg]);

      // Add empty assistant message for streaming
      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "" },
      ]);

      // What the user sees is what they typed; what the agent gets also
      // carries the selected element's markup.
      const outgoing = context
        ? `Trabajá sobre este elemento del slide actual:

\`\`\`html
${context.html}
\`\`\`

${message}`
        : message;

      abortRef.current = new AbortController();

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: outgoing,
            sessionId,
            carouselId,
            engine,
            model,
            effort,
            attachments,
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(
            (err as { error?: string }).error ||
              "No se pudo conectar con el motor de IA."
          );
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let accumulated = "";
        let buffer = "";

        // Every SSE frame we emit is a `data:` line — the `event:` line only
        // labels it. One branch handles them all; splitting on the event name
        // is what made the sessionId handler unreachable before.
        const handleLine = (line: string) => {
          if (!line.startsWith("data: ")) return;
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(line.slice(6));
          } catch {
            return;
          }

          if (typeof data.sessionId === "string" && data.sessionId) {
            setSessionId(data.sessionId);
            localStorage.setItem(sessionKey, data.sessionId);
          }

          if (typeof data.error === "string") {
            // server-side failures arrive as `event: error`; without this
            // the chat just goes silent and looks stuck
            setError(
              typeof data.stderr === "string"
                ? `${data.error} — ${data.stderr}`
                : data.error
            );
            return;
          }

          if (data.type === "usage") {
            setUsage((prev) => {
              // `totalTokens` is the engine's own running total and replaces
              // ours; `tokens` is one turn and adds to it.
              const next: Usage = {
                tokens:
                  typeof data.totalTokens === "number"
                    ? data.totalTokens
                    : prev.tokens +
                      (typeof data.tokens === "number" ? data.tokens : 0),
                planUsedPct:
                  typeof data.planUsedPct === "number"
                    ? data.planUsedPct
                    : prev.planUsedPct,
                planLabel:
                  typeof data.planLabel === "string"
                    ? data.planLabel
                    : prev.planLabel,
              };
              localStorage.setItem(usageKey, JSON.stringify(next));
              return next;
            });
            return;
          }

          if (data.type === "status" && typeof data.text === "string") {
            const text = data.text;
            // Repeating the same line (an item announced on both start and
            // completion) must not restart the clock, or it never reads true.
            setStatus((prev) =>
              prev?.text === text ? prev : { text, at: Date.now() }
            );
            return;
          }

          if (
            (data.type === "token" || data.type === "result") &&
            typeof data.text === "string"
          ) {
            // `result` restates the whole turn; `token` appends to it.
            accumulated =
              data.type === "result" ? data.text : accumulated + data.text;
            setStatus(null);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: accumulated } : m
              )
            );
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) handleLine(line);
        }

        if (buffer.trim()) {
          for (const line of buffer.split("\n")) handleLine(line);
        }
      } catch (err) {
        // Either way the bubble we opened for the answer has to go if nothing
        // ever landed in it — "Detener" used to leave an empty one behind for
        // the rest of the conversation.
        setMessages((prev) =>
          prev.filter((m) => m.id !== assistantId || m.content.length > 0)
        );
        if (err instanceof Error && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Ocurrió un error inesperado"
        );
      } finally {
        setIsStreaming(false);
        setStatus(null);
        abortRef.current = null;
        onStreamEnd?.();
      }
    },
    [
      isStreaming,
      sessionId,
      sessionKey,
      usageKey,
      engine,
      model,
      effort,
      carouselId,
      onBeforeSend,
      onStreamStart,
      onStreamEnd,
      context,
    ]
  );

  if (!anyEngineAvailable) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <Plug className="h-10 w-10 text-muted-foreground mb-3" />
        <h3 className="font-semibold text-section mb-1">Conectá un motor de IA</h3>
        <p className="text-label text-muted-foreground max-w-[220px] mb-3">
          Necesitás al menos una CLI instalada para crear carruseles con IA.
        </p>
        <ul className="text-label text-muted-foreground space-y-1.5 text-left">
          {engines.map((e) => (
            <li key={e.id}>
              <span className="font-medium text-foreground">{e.label}</span>
              {e.reason ? ` — ${e.reason}` : ""}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex gap-3 text-label">
          <a
            href="https://docs.anthropic.com/en/docs/claude-code"
            target="_blank"
            rel="noopener noreferrer"
            className="oc-focus rounded text-accent underline underline-offset-4"
          >
            Instalar Claude
          </a>
          <a
            href="https://developers.openai.com/codex/cli"
            target="_blank"
            rel="noopener noreferrer"
            className="oc-focus rounded text-accent underline underline-offset-4"
          >
            Instalar Codex
          </a>
        </div>
      </div>
    );
  }

  // Clearing throws away the conversation *and* the engine's session, and
  // there is no undo for either — so it asks first.
  const clearButton = messages.length > 0 && (
    <button
      type="button"
      onClick={() => setConfirmClear(true)}
      className="oc-focus cursor-pointer rounded px-1.5 py-0.5 text-micro text-muted-foreground transition-colors hover:text-destructive"
    >
      Limpiar la conversación
    </button>
  );

  const engineLabel = engines.find((e) => e.id === engine)?.label ?? engine;
  // The plan reads as what is left, because that is the number you act on;
  // the tokens stay a count of what was actually spent. The engine's name is
  // in the selector right above, so the line only needs the two numbers —
  // anything longer wraps to a second row in this column.
  const planLeft =
    usage.planUsedPct === undefined
      ? null
      : Math.max(0, 100 - usage.planUsedPct);
  const usageLine = [
    planLeft !== null &&
      `Plan ${planLeft.toFixed(planLeft < 10 ? 1 : 0)}% libre${
        usage.planLabel ? ` (${usage.planLabel})` : ""
      }`,
    usage.tokens > 0 && `${formatTokens(usage.tokens)} tokens`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="h-full flex flex-col">
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="¿Limpiar la conversación?"
        description="Se borra el historial de este carrusel y la IA arranca sin memoria de lo hablado. Los slides no se tocan."
        confirmLabel="Limpiar"
        variant="destructive"
        onConfirm={handleClearChat}
      />

      <div className="px-4 py-3 border-b border-border">
        {!embedded && (
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-section font-semibold">Asistente de IA</h2>
              <p className="text-label text-muted-foreground">
                Contale qué carrusel querés armar
              </p>
            </div>
            {clearButton}
          </div>
        )}
        {embedded && <div className="mb-2 empty:mb-0">{clearButton}</div>}
        <EngineSelector
          engines={engines}
          value={engine}
          onChange={handleEngineChange}
          model={model}
          onModelChange={handleModelChange}
          effort={effort}
          onEffortChange={handleEffortChange}
          disabled={isStreaming}
        />
        {usageLine && (
          <p
            className="mt-2 text-micro text-muted-foreground tabular-nums"
            title={`Plan ${engineLabel}: queda ${planLeft?.toFixed(1) ?? "?"}%${
              usage.planLabel ? ` de la ventana de ${usage.planLabel}` : ""
            } · ${usage.tokens.toLocaleString("es-AR")} tokens consumidos en esta sesión`}
          >
            {usageLine}
          </p>
        )}
      </div>

      <ReferenceImages
        carouselId={carouselId}
        images={referenceImages}
        onImagesChange={() => onStreamEnd?.()}
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 && (
          <div className="p-6 text-center text-muted-foreground">
            <p className="mb-1 text-body">Todavía no hay mensajes</p>
            <p className="text-label">
              Pedile un carrusel, o seleccioná un elemento y pedile un cambio.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            role={msg.role}
            content={msg.content}
            attachments={msg.attachments}
            isStreaming={
              isStreaming &&
              msg.role === "assistant" &&
              msg.id === messages[messages.length - 1]?.id
            }
          />
        ))}
        {error && (
          <div
            role="alert"
            className="mx-4 my-2 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-label text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}
      </div>

      {isStreaming && status && (
        <div
          className="px-4 py-1.5 border-t border-border flex items-center gap-2 text-label text-muted-foreground"
          aria-live="polite"
        >
          <span
            className="h-1.5 w-1.5 rounded-full bg-accent shrink-0 animate-pulse"
            aria-hidden
          />
          <span className="truncate font-mono">{status.text}</span>
          {now - status.at >= 20_000 && (
            <span className="ml-auto shrink-0 font-mono tabular-nums">
              {formatElapsed(now - status.at)}
            </span>
          )}
        </div>
      )}

      {context && (
        <div className="flex items-center gap-2 border-t border-border bg-accent-soft px-4 py-2">
          <span className="min-w-0 flex-1 truncate text-label text-foreground">
            Sobre: <strong className="font-medium">{context.label}</strong>
          </span>
          <button
            type="button"
            onClick={onClearContext}
            className="oc-focus shrink-0 cursor-pointer rounded px-1.5 py-0.5 text-micro text-muted-foreground hover:text-foreground"
          >
            Quitar
          </button>
        </div>
      )}

      <ChatInput
        onSend={handleSend}
        isStreaming={isStreaming}
        textareaRef={chatInputRef}
        onStop={handleStopGenerating}
      />
    </div>
  );
}
