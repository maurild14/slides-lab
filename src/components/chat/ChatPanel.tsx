"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput, type ChatAttachment } from "./ChatInput";
import { ReferenceImages } from "./ReferenceImages";
import { EngineSelector } from "./EngineSelector";
import { AlertCircle, Plug } from "lucide-react";
import type { ReferenceImage } from "@/types/carousel";
import type { EngineId, EngineStatus } from "@/lib/agents";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
}

interface ChatPanelProps {
  carouselId: string;
  referenceImages?: ReferenceImage[];
  engines: EngineStatus[];
  onStreamStart?: () => void;
  onStreamEnd?: () => void;
  chatInputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function ChatPanel({
  carouselId,
  engines,
  referenceImages = [],
  onStreamStart,
  onStreamEnd,
  chatInputRef,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
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

  // Load chat history and the engine chosen for this carousel
  useEffect(() => {
    try {
      const storedMessages = localStorage.getItem(`chat-messages-${carouselId}`);
      if (storedMessages) setMessages(JSON.parse(storedMessages));
    } catch {
      // ignore corrupted data
    }
    const storedEngine = localStorage.getItem(`chat-engine-${carouselId}`);
    if (storedEngine === "claude" || storedEngine === "codex") {
      setEngine(storedEngine);
    }
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

  // Persist messages to localStorage
  const persistMessages = useCallback(
    (msgs: Message[]) => {
      try {
        localStorage.setItem(`chat-messages-${carouselId}`, JSON.stringify(msgs));
      } catch {
        // ignore quota errors
      }
    },
    [carouselId]
  );

  const handleClearChat = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    localStorage.removeItem(`chat-messages-${carouselId}`);
    localStorage.removeItem(sessionKey);
  }, [carouselId, sessionKey]);

  const handleStopGenerating = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(
    async (message: string, attachments: ChatAttachment[] = []) => {
      if (isStreaming) return;
      setError(null);
      setIsStreaming(true);
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

      abortRef.current = new AbortController();

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
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
        const message = err instanceof Error ? err.message : "An unexpected error occurred";
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
        // Persist messages after stream completes
        setMessages((prev) => {
          persistMessages(prev);
          return prev;
        });
        onStreamEnd?.();
      }
    },
    [
      isStreaming,
      sessionId,
      sessionKey,
      engine,
      carouselId,
      onStreamStart,
      onStreamEnd,
      persistMessages,
    ]
  );

  if (!anyEngineAvailable) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <Plug className="h-10 w-10 text-muted-foreground mb-3" />
        <h3 className="font-semibold text-sm mb-1">Conectá un motor de IA</h3>
        <p className="text-xs text-muted-foreground max-w-[220px] mb-3">
          Necesitás al menos una CLI instalada para crear carruseles con IA.
        </p>
        <ul className="text-xs text-muted-foreground space-y-1.5 text-left">
          {engines.map((e) => (
            <li key={e.id}>
              <span className="font-medium text-foreground">{e.label}</span>
              {e.reason ? ` — ${e.reason}` : ""}
            </li>
          ))}
        </ul>
        <div className="flex gap-3 mt-4 text-xs">
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
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold">AI Assistant</h2>
            <p className="text-xs text-muted-foreground">
              Describe the carousel you want to create
            </p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="text-[10px] text-muted-foreground hover:text-destructive transition-colors px-1.5 py-0.5 rounded"
            >
              Clear
            </button>
          )}
        </div>
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
            <p className="text-sm mb-1">No messages yet</p>
            <p className="text-xs">
              Tell me what carousel you&apos;d like to create
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
          <div className="mx-4 my-2 flex items-center gap-2 text-destructive text-xs bg-destructive/10 rounded-lg p-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {isStreaming && status && (
        <div
          className="px-4 py-1.5 border-t border-border flex items-center gap-2 text-[11px] text-muted-foreground"
          aria-live="polite"
        >
          <span
            className="h-1.5 w-1.5 rounded-full bg-accent shrink-0 animate-pulse"
            aria-hidden
          />
          <span className="truncate font-mono">{status}</span>
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
