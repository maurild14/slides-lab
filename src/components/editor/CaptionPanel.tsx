"use client";

import { useState } from "react";
import { Copy, Check, ChevronDown, Hash, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CaptionPanelProps {
  caption?: string;
  hashtags?: string[];
}

type Slot = "caption" | "hashtags";

export function CaptionPanel({ caption, hashtags }: CaptionPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasCaption = Boolean(caption && caption.trim());
  const hasHashtags = Boolean(hashtags && hashtags.length > 0);
  if (!hasCaption && !hasHashtags) return null;

  // The clipboard rejects on a denied permission or an insecure origin, and a
  // copy button that silently does nothing is the worst kind of broken.
  const handleCopy = async (text: string, slot: Slot) => {
    setError(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(slot);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("El navegador no dejó copiar. Seleccioná el texto y usá Ctrl C.");
    }
  };

  return (
    <div className="shrink-0 border-t border-border bg-surface">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="oc-focus flex w-full cursor-pointer items-center justify-between px-4 py-2 text-label font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" aria-hidden />
          Texto y hashtags
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform duration-200",
            expanded ? "rotate-180" : "rotate-0"
          )}
          aria-hidden
        />
      </button>

      {expanded && (
        <div className="space-y-3 px-4 pb-3">
          {hasCaption && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-micro font-medium text-muted-foreground">
                  Texto del posteo
                </span>
                <CopyButton
                  done={copied === "caption"}
                  onClick={() => handleCopy(caption!, "caption")}
                />
              </div>
              <p className="whitespace-pre-wrap rounded-md bg-muted p-2 text-label text-foreground">
                {caption}
              </p>
            </div>
          )}

          {hasHashtags && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1 text-micro font-medium text-muted-foreground">
                  <Hash className="h-3 w-3" aria-hidden />
                  Hashtags ({hashtags!.length})
                </span>
                <CopyButton
                  done={copied === "hashtags"}
                  label="Copiar todos"
                  onClick={() =>
                    handleCopy(hashtags!.map((h) => `#${h}`).join(" "), "hashtags")
                  }
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {hashtags!.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-accent-soft px-2 py-0.5 text-micro text-accent"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="text-micro text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CopyButton({
  done,
  label = "Copiar",
  onClick,
}: {
  done: boolean;
  label?: string;
  onClick: () => void;
}) {
  return (
    <Button variant="ghost" size="sm" className="gap-1.5 px-2" onClick={onClick}>
      {done ? (
        <Check className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
      {done ? "Copiado" : label}
    </Button>
  );
}
