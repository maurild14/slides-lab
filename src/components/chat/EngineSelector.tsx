"use client";

import type { ReactNode } from "react";
import { ChevronDown, ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EngineId, EngineStatus } from "@/lib/agents";

interface EngineSelectorProps {
  engines: EngineStatus[];
  value: EngineId;
  onChange: (engine: EngineId) => void;
  model: string;
  onModelChange: (model: string) => void;
  effort: string;
  onEffortChange: (effort: string) => void;
  disabled?: boolean;
}

/**
 * ponytail: native <select>s. Keyboard support, focus handling and screen
 * reader semantics come for free, and these get touched once a session. Swap
 * for a popover only if they need richer rows.
 */
function Dropdown({
  label,
  value,
  onChange,
  disabled,
  invalid,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={cn(
          "oc-focus h-control appearance-none rounded-md border border-border bg-surface",
          "pl-2 pr-6 text-label font-medium cursor-pointer",
          "transition-colors duration-150",
          "hover:border-foreground/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          invalid && "border-destructive/50 text-destructive"
        )}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
        strokeWidth={2}
        aria-hidden
      />
    </div>
  );
}

export function EngineSelector({
  engines,
  value,
  onChange,
  model,
  onModelChange,
  effort,
  onEffortChange,
  disabled,
}: EngineSelectorProps) {
  const active = engines.find((e) => e.id === value);
  const unavailable = active && !active.available;
  // Empty until /api/chat/check answers — the page starts with an optimistic
  // status that claims nothing about models. "" is a valid choice either way,
  // so the control is never in a state it cannot render.
  const models = active?.models ?? [];
  const efforts = active?.efforts ?? [];

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
      <Dropdown
        label="Motor de IA"
        value={value}
        onChange={(next) => onChange(next as EngineId)}
        disabled={disabled}
        invalid={unavailable}
      >
        {engines.map((e) => (
          <option key={e.id} value={e.id} disabled={!e.available}>
            {e.label}
            {e.available ? "" : ` — ${e.reason ?? "no disponible"}`}
          </option>
        ))}
      </Dropdown>

      <Dropdown
        label={`Modelo de ${active?.label ?? value}`}
        value={model}
        onChange={onModelChange}
        disabled={disabled}
      >
        {/* Always first, and the default: pass no flag and let the CLI use the
            model its own config names. It is also the escape hatch if a slug
            in the list is ever retired upstream. */}
        <option value="">Modelo del CLI</option>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </Dropdown>

      <Dropdown
        label="Esfuerzo de razonamiento"
        value={effort}
        onChange={onEffortChange}
        disabled={disabled}
      >
        <option value="">Esfuerzo del CLI</option>
        {efforts.map((e) => (
          <option key={e.id} value={e.id}>
            {e.label}
          </option>
        ))}
      </Dropdown>

      {active?.supportsImagegen && (
        <span
          className="inline-flex items-center gap-1 text-micro text-muted-foreground"
          title="Este motor puede generar imágenes"
        >
          <ImagePlus className="h-3 w-3" strokeWidth={1.5} aria-hidden />
          imágenes
        </span>
      )}

      {unavailable && (
        <span className="text-micro text-destructive">{active?.reason}</span>
      )}
    </div>
  );
}
