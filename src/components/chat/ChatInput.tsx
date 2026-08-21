"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Send, Square, Paperclip, X, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ChatAttachment {
  url: string;
  name: string;
}

interface PendingAttachment extends ChatAttachment {
  localPreview: string;
  uploading: boolean;
  error?: boolean;
}

interface ChatInputProps {
  onSend: (message: string, attachments: ChatAttachment[]) => void;
  isStreaming: boolean;
  disabled?: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onStop?: () => void;
}

const SUGGESTIONS = [
  "Create a 5-slide carousel about...",
  "Make the design more minimal",
  "Change the accent color to blue",
  "Add a call-to-action slide",
  "Make the headings bigger",
];

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_ATTACHMENTS = 4;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export function ChatInput({
  onSend,
  isStreaming,
  disabled,
  textareaRef: externalRef,
  onStop,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = externalRef || internalRef;

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      attachments.forEach((a) => URL.revokeObjectURL(a.localPreview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uploading = attachments.some((a) => a.uploading);

  const uploadFile = useCallback(async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) return;
    if (file.size > MAX_FILE_SIZE) return;
    if (attachments.length >= MAX_ATTACHMENTS) return;

    const localPreview = URL.createObjectURL(file);
    const tempId = `${Date.now()}-${Math.random()}`;
    const placeholder: PendingAttachment = {
      url: tempId,
      name: file.name,
      localPreview,
      uploading: true,
    };
    setAttachments((prev) => [...prev, placeholder]);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("upload failed");
      const data = (await res.json()) as { url: string };
      setAttachments((prev) =>
        prev.map((a) =>
          a.url === tempId
            ? { ...a, url: data.url, uploading: false }
            : a
        )
      );
    } catch {
      setAttachments((prev) =>
        prev.map((a) =>
          a.url === tempId ? { ...a, uploading: false, error: true } : a
        )
      );
    }
  }, [attachments.length]);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) =>
        ACCEPTED_TYPES.includes(f.type)
      );
      const available = MAX_ATTACHMENTS - attachments.length;
      list.slice(0, available).forEach((f) => uploadFile(f));
    },
    [attachments.length, uploadFile]
  );

  const removeAttachment = useCallback((url: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.url === url);
      if (target) URL.revokeObjectURL(target.localPreview);
      return prev.filter((a) => a.url !== url);
    });
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (isStreaming || uploading) return;
    if (!trimmed && attachments.length === 0) return;
    const sendable = attachments
      .filter((a) => !a.uploading && !a.error)
      .map(({ url, name }) => ({ url, name }));
    onSend(trimmed, sendable);
    attachments.forEach((a) => URL.revokeObjectURL(a.localPreview));
    setAttachments([]);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (!e.clipboardData?.files?.length) return;
    const imageFiles = Array.from(e.clipboardData.files).filter((f) =>
      ACCEPTED_TYPES.includes(f.type)
    );
    if (imageFiles.length > 0) {
      e.preventDefault();
      handleFiles(imageFiles);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const canSend =
    !isStreaming &&
    !uploading &&
    !disabled &&
    (value.trim().length > 0 || attachments.some((a) => !a.error));

  return (
    <div
      className="border-t border-border p-3 relative"
      onDragEnter={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragActive(false);
      }}
      onDrop={handleDrop}
    >
      {dragActive && (
        <div className="absolute inset-2 z-10 border-2 border-dashed border-accent rounded-xl bg-accent/5 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-2 text-label text-accent font-medium">
            <ImagePlus className="h-4 w-4" />
            Drop images to attach
          </div>
        </div>
      )}

      {value.length === 0 && !isStreaming && attachments.length === 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {SUGGESTIONS.slice(0, 3).map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => setValue(suggestion)}
              className="text-label px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((att) => (
            <div
              key={att.url}
              className="relative group rounded-lg overflow-hidden border border-border bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={att.localPreview}
                alt={att.name}
                className="h-16 w-16 object-cover"
              />
              {att.uploading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 text-white animate-spin" />
                </div>
              )}
              {att.error && (
                <div className="absolute inset-0 bg-destructive/70 flex items-center justify-center">
                  <span className="text-micro text-white font-medium">
                    Failed
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeAttachment(att.url)}
                className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-foreground text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                aria-label={`Remove ${att.name}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="flex items-end gap-2">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={openFilePicker}
          disabled={
            isStreaming || disabled || attachments.length >= MAX_ATTACHMENTS
          }
          aria-label="Attach image"
          className="shrink-0"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onPaste={handlePaste}
          placeholder={
            isStreaming
              ? "AI is working..."
              : attachments.length > 0
              ? "Add a message about these images..."
              : "Describe your carousel..."
          }
          disabled={isStreaming || disabled}
          rows={1}
          className="flex-1 resize-none bg-muted rounded-lg px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          aria-label="Chat message input"
        />
        {isStreaming ? (
          <Button
            size="icon"
            variant="destructive"
            onClick={onStop}
            aria-label="Stop generating"
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={handleSubmit}
            disabled={!canSend}
            aria-label="Send message"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
