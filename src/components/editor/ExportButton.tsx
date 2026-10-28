"use client";

import { useT } from "@/components/locale-provider";
import { useState } from "react";
import { AlertCircle, Check, ChevronDown, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";

type Format = "png" | "jpg" | "png-transparent" | "pdf";

interface ExportButtonProps {
  carouselId: string;
  slideCount: number;
  /** The slide on screen, for the "solo este slide" half of the menu. */
  activeSlideId?: string | null;
  activeSlideNumber?: number;
  /** Flush pending canvas edits so the export renders what is on screen. */
  onBeforeExport?: () => Promise<void>;
}

const LABELS: Record<Format, string> = {
  png: "PNG",
  jpg: "JPG",
  "png-transparent": "Transparent PNG",
  pdf: "PDF",
};

export function ExportButton({
  carouselId,
  slideCount,
  activeSlideId,
  activeSlideNumber,
  onBeforeExport,
}: ExportButtonProps) {
  const t = useT();
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (format: Format, slideId?: string) => {
    if (exporting || slideCount === 0) return;
    // The server renders from stored HTML, so anything still sitting in the
    // iframe has to reach it first or the export comes out stale.
    await onBeforeExport?.();
    setExporting(true);
    setDone(false);
    setError(null);

    try {
      const response = await fetch(`/api/carousels/${carouselId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, slideId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? t("Couldn't export"));
      }

      // The filename the server chose travels in Content-Disposition — and it
      // has to be read off the response here, because a blob: URL carries no
      // headers. Leaving `download` empty saved every export as "download".
      const named = /filename="?([^";]+)"?/i.exec(
        response.headers.get("Content-Disposition") ?? ""
      );
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = named?.[1] ?? `carousel.${format === "pdf" ? "pdf" : "zip"}`;
      a.click();
      // Revoking in the same tick cancels the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Couldn't export"));
    } finally {
      setExporting(false);
    }
  };

  const disabled = exporting || slideCount === 0;

  return (
    <div className="flex items-center gap-1.5">
      {error && (
        <span className="flex items-center gap-1 text-label text-destructive" role="alert">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </span>
      )}

      {/* One split control, not two loose pills: the common case is one click,
          and the chevron is the same action with options. */}
      <div className="flex items-center">
        <Button
          onClick={() => run("png")}
          disabled={disabled}
          variant="accent"
          size="sm"
          className="rounded-r-none"
        >
          <span
            key={exporting ? "exporting" : done ? "done" : "idle"}
            className="oc-enter-pop inline-flex items-center gap-2"
          >
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {t("Exporting…")}
              </>
            ) : done ? (
              <>
                <Check className="h-4 w-4" aria-hidden />
                {t("Done")}
              </>
            ) : (
              <>
                <Download className="h-4 w-4" aria-hidden />
                {t("Export PNG")}
              </>
            )}
          </span>
        </Button>

        <Menu>
          <MenuTrigger asChild>
            <Button
              variant="accent"
              size="sm"
              disabled={disabled}
              aria-label={t("Choose the export format")}
              className="ml-px rounded-l-none px-2"
            >
              <ChevronDown className="h-4 w-4" aria-hidden />
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuLabel>{t("Whole carousel ({n})", { n: slideCount })}</MenuLabel>
            {(["png", "jpg", "png-transparent", "pdf"] as Format[]).map((f) => (
              <MenuItem key={f} onSelect={() => run(f)}>
                {t(LABELS[f])}
                {f !== "pdf" && slideCount > 1 && (
                  <span className="ml-auto pl-4 text-micro text-muted-foreground">ZIP</span>
                )}
              </MenuItem>
            ))}

            {activeSlideId && (
              <>
                <MenuSeparator />
                <MenuLabel>
                  {t("Only slide {n}", { n: activeSlideNumber ?? "" })}
                </MenuLabel>
                {(["png", "jpg", "png-transparent"] as Format[]).map((f) => (
                  <MenuItem key={f} onSelect={() => run(f, activeSlideId)}>
                    {t(LABELS[f])}
                  </MenuItem>
                ))}
              </>
            )}
          </MenuContent>
        </Menu>
      </div>
    </div>
  );
}
