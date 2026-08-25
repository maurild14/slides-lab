"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { IconButton } from "./button";
import { cn } from "@/lib/utils";

interface DialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Icon badge to the left of the title. */
  icon?: React.ReactNode;
  /** Buttons for the footer, in reading order (secondary first). */
  footer?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

/**
 * The one modal shell. Both dialogs used to inline their own copy of this and
 * drifted apart — different title sizes, different close-button sizes.
 */
export function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  icon,
  footer,
  className,
  children,
}: DialogShellProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-oc-overlay
          className="fixed inset-0 z-(--z-modal) bg-black/50 backdrop-blur-sm"
        />
        <Dialog.Content
          data-oc-dialog
          className={cn(
            // Capped and scrollable: centred on the viewport, a dialog taller
            // than the window loses its top edge off screen, and with it the
            // title and the close button.
            "fixed left-1/2 top-1/2 z-(--z-modal) max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-modal",
            className
          )}
        >
          <div className="flex items-start gap-3">
            {icon}
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-title font-semibold">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-body text-muted-foreground">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <IconButton label="Cerrar" size="sm" className="-mr-1 -mt-1">
                <X className="h-4 w-4" aria-hidden />
              </IconButton>
            </Dialog.Close>
          </div>

          {children && <div className="mt-5 space-y-4">{children}</div>}

          {footer && (
            <div className="mt-6 flex justify-end gap-2">{footer}</div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Circular icon badge used in the dialog header. */
export function DialogIcon({
  children,
  tone = "accent",
}: {
  children: React.ReactNode;
  tone?: "accent" | "destructive";
}) {
  return (
    <div
      className={cn(
        "flex h-control-lg w-control-lg shrink-0 items-center justify-center rounded-full",
        tone === "destructive"
          ? "bg-destructive/10 text-destructive"
          : "bg-accent-soft text-accent"
      )}
      aria-hidden
    >
      {children}
    </div>
  );
}

export const DialogClose = Dialog.Close;
