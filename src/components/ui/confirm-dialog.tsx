"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "./button";
import { useT } from "@/components/locale-provider";
import { DialogShell, DialogIcon, DialogClose } from "./dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "destructive" | "default";
  onConfirm: () => void;
  /** A second way out that is not "cancel" — e.g. "only change the canvas". */
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  variant = "default",
  onConfirm,
  secondaryLabel,
  onSecondary,
}: ConfirmDialogProps) {
  const t = useT();
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      icon={
        <DialogIcon tone={variant === "destructive" ? "destructive" : "accent"}>
          <AlertTriangle className="h-5 w-5" />
        </DialogIcon>
      }
      footer={
        <>
          <DialogClose asChild>
            <Button variant="ghost">{t("Cancel")}</Button>
          </DialogClose>
          {secondaryLabel && onSecondary && (
            <Button
              variant="outline"
              onClick={() => {
                onSecondary();
                onOpenChange(false);
              }}
            >
              {secondaryLabel}
            </Button>
          )}
          <Button
            variant={variant === "destructive" ? "destructive" : "accent"}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel ?? t("Confirm")}
          </Button>
        </>
      }
    />
  );
}
