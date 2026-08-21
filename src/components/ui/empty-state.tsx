"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  /** What to do about it. An empty state without a next step is a blank page. */
  hint?: string;
  action?: React.ReactNode;
  /** `error` means something failed, not that there is nothing yet. */
  tone?: "empty" | "error";
  /** Roomy for a full page, compact inside a panel or a tab. */
  size?: "md" | "sm";
  className?: string;
}

/**
 * The one empty/error state. Dashboard, plantillas and the inspector each had
 * their own copy with different icon sizes and different type scales.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  tone = "empty",
  size = "md",
  className,
}: EmptyStateProps) {
  const error = tone === "error";
  return (
    <div
      className={cn("text-center", size === "md" ? "py-16" : "py-8", className)}
      role={error ? "alert" : undefined}
    >
      <div
        aria-hidden
        className={cn(
          "mx-auto mb-3 flex items-center justify-center rounded-full",
          size === "md" ? "h-14 w-14" : "h-10 w-10",
          error ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
        )}
      >
        {icon}
      </div>
      <p className={cn("font-semibold", size === "md" ? "text-title" : "text-section")}>
        {title}
      </p>
      {hint && (
        <p className="mx-auto mt-1 max-w-md text-body leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
