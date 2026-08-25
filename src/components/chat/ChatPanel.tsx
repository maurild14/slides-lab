"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput, type ChatAttachment } from "./ChatInput";
import { ReferenceImages } from "./ReferenceImages";
import { EngineSelector } from "./EngineSelector";
import { AlertCircle, Plug } from "lucide-react";
import type { ChatMessage as Message, ReferenceImage } from "@/types/carousel";
import type { EngineId, EngineStatus } from "@/lib/agents";

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
  const [status, setStatus] = useState<string | null>(null);
  const [engine, setEngine] = useState<EngineId>("claude");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Sessions are per engine: a Claude session id means nothing to Codex.
  const sessionKey = `chat-session-${carouselId}-${engine}`;
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

  const handleEngineChange = useCallback(
    (next: EngineId) => {
      setEngine(next);
      localStorage.setItem(`chat-engine-${carouselId}`, next);
    },
    [carouselId]
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
  }, [carouselId, sessionKey]);

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
            attachments,
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(
            (err as { error?: string }).error || "Failed to connect to AI"
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

          if (data.type === "status" && typeof data.text === "string") {
            setStatus(data.text);
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
        if (err instanceof Error && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : "Ocurrió un error inesperado";
        setError(message);
        // Remove empty assistant message on error
        setMessages((prev) =>
          prev.filter(
            (m) => m.id !== assistantId || m.content.length > 0
          )
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
      engine,
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
        <div className="flex gap-3 mt-4 text-label">
          <a
            href="https://docs.anthropic.com/en/docs/claude-code"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline"
          >
            Instalar Claude
          </a>
          <a
            href="https://developers.openai.com/codex/cli"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline"
          >
            Instalar Codex
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-border">
        {!embedded && (
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-section font-semibold">Asistente de IA</h2>
              <p className="text-label text-muted-foreground">
                Contale qué carrusel querés armar
              </p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={handleClearChat}
                className="oc-focus cursor-pointer rounded px-1.5 py-0.5 text-micro text-muted-foreground transition-colors hover:text-destructive"
              >
                Limpiar
              </button>
            )}
          </div>
        )}
        {embedded && messages.length > 0 && (
          <button
            onClick={handleClearChat}
            className="oc-focus mb-2 cursor-pointer rounded px-1.5 py-0.5 text-micro text-muted-foreground transition-colors hover:text-destructive"
          >
            Limpiar la conversación
          </button>
        )}
        <EngineSelector
          engines={engines}
          value={engine}
          onChange={handleEngineChange}
          disabled={isStreaming}
        />
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
          <div className="mx-4 my-2 flex items-center gap-2 text-destructive text-label bg-destructive/10 rounded-lg p-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
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
          <span className="truncate font-mono">{status}</span>
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
