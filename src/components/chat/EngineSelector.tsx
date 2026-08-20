"use client";

import { ChevronDown, ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EngineId, EngineStatus } from "@/lib/agents";

interface EngineSelectorProps {
  engines: EngineStatus[];
  value: EngineId;
  onChange: (engine: EngineId) => void;
  disabled?: boolean;
}

/**
 * ponytail: a native <select>. Keyboard support, focus handling and screen
 * reader semantics come for free, and this control holds two options and gets
 * touched once a session. Swap for a popover only if it needs richer rows.
 */
export function EngineSelector({
  engines,
  value,
  onChange,
  disabled,
}: EngineSelectorProps) {
  const active = engines.find((e) => e.id === value);
  const unavailable = active && !active.available;

  return (
    <div className="mt-2.5 flex items-center gap-1.5">
      <div className="relative">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value as EngineId)}
          aria-label="Motor de IA"
          className={cn(
            "h-7 appearance-none rounded-md border border-border bg-surface",
            "pl-2 pr-6 text-xs font-medium cursor-pointer",
            "transition-colors duration-150",
            "hover:border-foreground/20 focus:outline-none focus:ring-2 focus:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            unavailable && "border-destructive/50 text-destructive"
          )}
        >
          {engines.map((e) => (
            <option key={e.id} value={e.id} disabled={!e.available}>
              {e.label}
              {e.available ? "" : ` — ${e.reason ?? "no disponible"}`}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
          strokeWidth={2}
          aria-hidden
        />
      </div>

      {active?.supportsImagegen && (
        <span
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
          title="Este motor puede generar imágenes"
        >
          <ImagePlus className="h-3 w-3" strokeWidth={1.5} aria-hidden />
          imágenes
        </span>
      )}

      {unavailable && (
        <span className="text-[10px] text-destructive">{active?.reason}</span>
      )}
    </div>
  );
}
