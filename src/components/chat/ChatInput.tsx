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
  "Armá un carrusel de 5 slides sobre…",
  "Hacé el diseño más minimalista",
  "Cambiá el color de acento a azul",
  "Agregá un slide de llamada a la acción",
  "Agrandá los títulos",
];

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
// Windows hands files an empty `file.type` when the extension has no registry
// MIME mapping, so a plain .png got refused before it ever reached the server.
const ACCEPTED_EXT = /\.(png|jpe?g|webp)$/i;
const MAX_ATTACHMENTS = 4;
const MAX_FILE_SIZE = 20 * 1024 * 1024;

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
  /** Why a file was refused. Dropping one used to do nothing at all. */
  const [notice, setNotice] = useState<string | null>(null);
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
    if (!ACCEPTED_TYPES.includes(file.type) && !ACCEPTED_EXT.test(file.name)) {
      setNotice(`«${file.name}» no es PNG, JPG, JPEG ni WebP.`);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setNotice(`«${file.name}» pesa más de 20 MB.`);
      return;
    }
    if (attachments.length >= MAX_ATTACHMENTS) {
      setNotice(`Se pueden adjuntar hasta ${MAX_ATTACHMENTS} imágenes.`);
      return;
    }
    setNotice(null);

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
      // Everything goes through uploadFile, rejects included: it is the one
      // place that says out loud why a file did not make it.
      const available = MAX_ATTACHMENTS - attachments.length;
      Array.from(files)
        .slice(0, Math.max(available, 1))
        .forEach((f) => uploadFile(f));
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
          <div className="flex items-center gap-2 text-label font-medium text-accent">
            <ImagePlus className="h-4 w-4" aria-hidden />
            Soltá las imágenes para adjuntarlas
          </div>
        </div>
      )}

      {value.length === 0 && !isStreaming && attachments.length === 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {SUGGESTIONS.slice(0, 3).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                setValue(suggestion);
                textareaRef.current?.focus();
              }}
              className="oc-focus oc-press cursor-pointer rounded-full border border-border px-2.5 py-1 text-label text-muted-foreground hover:bg-muted hover:text-foreground"
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
              // Not `overflow-hidden`: the remove button hangs off the corner.
              className="group relative rounded-lg border border-border bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={att.localPreview}
                alt={att.name}
                className="h-16 w-16 rounded-lg object-cover"
              />
              {att.uploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                  <Loader2 className="h-4 w-4 animate-spin text-white" aria-hidden />
                  <span className="sr-only">Subiendo {att.name}</span>
                </div>
              )}
              {att.error && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-destructive/80">
                  <span className="text-micro font-medium text-white">
                    No subió
                  </span>
                </div>
              )}
              {/* Always visible: hover-only made this unreachable by keyboard
                  and on touch, with no other way to drop an attachment. */}
              <button
                type="button"
                onClick={() => removeAttachment(att.url)}
                className="oc-focus absolute -right-1.5 -top-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-surface bg-foreground text-background shadow-rest transition-colors hover:bg-destructive hover:text-white"
                aria-label={`Quitar ${att.name}`}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      {notice && (
        <p role="alert" className="mb-2 text-micro text-destructive">
          {notice}
        </p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
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
          aria-label="Adjuntar una imagen"
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
              ? "La IA está trabajando…"
              : attachments.length > 0
              ? "Contale qué hacer con estas imágenes…"
              : "Pedile un carrusel…"
          }
          disabled={isStreaming || disabled}
          rows={1}
          className="oc-focus flex-1 resize-none rounded-lg bg-muted px-3 py-2.5 text-body placeholder:text-muted-foreground disabled:opacity-50"
          aria-label="Mensaje para la IA"
        />
        {isStreaming ? (
          <Button
            size="icon"
            variant="destructive"
            onClick={onStop}
            aria-label="Detener la generación"
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={handleSubmit}
            disabled={!canSend}
            aria-label="Enviar el mensaje"
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
