"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: string;
  /** Persistent helper text. Not a placeholder — it stays while you type. */
  hint?: string;
  error?: string;
  /** Label on the same row as the control, for dense property panels. */
  inline?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Label + control + message. The label is always visible: a placeholder that
 * disappears when you type is not a label.
 *
 * The message slot keeps its height whether or not there's a message, so an
 * error appearing never pushes the rest of the form down.
 */
export function Field({
  label,
  hint,
  error,
  inline = false,
  className,
  children,
}: FieldProps) {
  const id = React.useId();
  const messageId = `${id}-msg`;
  const message = error || hint;

  // The label points at the control by id, so the id has to land ON the
  // control — wrapping it in a div would leave the label pointing at nothing.
  const control = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id,
        "aria-describedby": message ? messageId : undefined,
        "aria-invalid": error ? true : undefined,
      })
    : children;

  if (inline) {
    return (
      <div className={cn("grid grid-cols-[5.5rem_1fr] items-center gap-3", className)}>
        <label
          htmlFor={id}
          title={label}
          className="truncate text-label text-muted-foreground"
        >
          {label}
        </label>
        {control}
        {message && (
          <p
            id={messageId}
            className={cn(
              "col-start-2 text-micro",
              error ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-label font-medium text-foreground">
        {label}
      </label>
      {control}
      <p
        id={messageId}
        className={cn(
          "min-h-4 text-micro",
          error ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {message}
      </p>
    </div>
  );
}

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  /** Rendered at the right of the header, e.g. a reset button. */
  action?: React.ReactNode;
  children: React.ReactNode;
}

/** Collapsible group inside a panel. Uses <details> so it works without JS. */
export function Section({
  title,
  defaultOpen = true,
  action,
  children,
}: SectionProps) {
  return (
    <details open={defaultOpen} className="group border-b border-border-subtle">
      <summary className="oc-focus flex h-control cursor-pointer list-none items-center gap-2 px-4 text-section font-semibold text-foreground marker:hidden hover:bg-muted [&::-webkit-details-marker]:hidden">
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-0 -rotate-90"
          aria-hidden
        />
        <span className="flex-1 text-left">{title}</span>
        {action && <span onClick={(e) => e.preventDefault()}>{action}</span>}
      </summary>
      <div className="flex flex-col gap-3 px-4 pb-4 pt-1">{children}</div>
    </details>
  );
}
