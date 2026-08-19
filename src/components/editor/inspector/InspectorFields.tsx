"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------- */
/* Section                                                              */
/* -------------------------------------------------------------------- */

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export function Section({
  title,
  defaultOpen = true,
  children,
  action,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center justify-between px-3 h-8">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 text-left text-[11px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          {title}
        </button>
        {action}
      </div>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Row (label + control)                                                */
/* -------------------------------------------------------------------- */

interface RowProps {
  label: string;
  children: React.ReactNode;
  hint?: string;
}

export function Row({ label, children, hint }: RowProps) {
  return (
    <div className="grid grid-cols-[64px_1fr] items-center gap-2">
      <label
        className="text-[11px] text-muted-foreground truncate"
        title={hint || label}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Color field (swatch + hex input + native picker)                     */
/* -------------------------------------------------------------------- */

interface ColorFieldProps {
  value: string;
  onChange: (hex: string) => void;
  placeholder?: string;
}

export function ColorField({ value, onChange, placeholder }: ColorFieldProps) {
  const [local, setLocal] = useState(value);
  const [lastSeenValue, setLastSeenValue] = useState(value);
  const pickerRef = useRef<HTMLInputElement>(null);

  // Adjust local state when parent prop changes (React 19 pattern)
  if (value !== lastSeenValue) {
    setLastSeenValue(value);
    setLocal(value);
  }

  const commit = (raw: string) => {
    const v = raw.trim().toLowerCase();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) {
      onChange(v);
    } else {
      setLocal(value); // revert
    }
  };

  return (
    <div className="flex items-center gap-1.5 h-7 rounded-md border border-border bg-surface focus-within:ring-2 focus-within:ring-ring px-1.5">
      <button
        type="button"
        onClick={() => pickerRef.current?.click()}
        className="h-4 w-4 rounded shrink-0 border border-black/10 ring-0"
        style={{ backgroundColor: value || "transparent" }}
        aria-label="Pick color"
      />
      <input
        ref={pickerRef}
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
        onChange={(e) => onChange(e.target.value.toLowerCase())}
        className="sr-only"
        tabIndex={-1}
      />
      <input
        type="text"
        value={local}
        placeholder={placeholder || "#000000"}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
        }}
        className="flex-1 min-w-0 bg-transparent text-xs font-mono uppercase outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Number field (with steppers via wheel)                               */
/* -------------------------------------------------------------------- */

interface NumberFieldProps {
  value: number | null;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  placeholder?: string;
}

export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  placeholder,
}: NumberFieldProps) {
  const [local, setLocal] = useState(value === null ? "" : String(value));
  const [lastSeenValue, setLastSeenValue] = useState(value);
  if (value !== lastSeenValue) {
    setLastSeenValue(value);
    setLocal(value === null ? "" : String(value));
  }

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "") return;
    const n = parseFloat(trimmed);
    if (Number.isNaN(n)) {
      setLocal(value === null ? "" : String(value));
      return;
    }
    let clamped = n;
    if (min !== undefined) clamped = Math.max(min, clamped);
    if (max !== undefined) clamped = Math.min(max, clamped);
    onChange(clamped);
  };

  return (
    <div className="flex items-center gap-1.5 h-7 rounded-md border border-border bg-surface focus-within:ring-2 focus-within:ring-ring px-2">
      <input
        type="number"
        value={local}
        step={step}
        min={min}
        max={max}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
        }}
        className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      {suffix && (
        <span className="text-[10px] text-muted-foreground select-none">
          {suffix}
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Select                                                               */
/* -------------------------------------------------------------------- */

interface SelectFieldProps {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ label: string; value: string }>;
}

export function SelectField({ value, onChange, options }: SelectFieldProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-full rounded-md border border-border bg-surface px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* -------------------------------------------------------------------- */
/* Text area                                                            */
/* -------------------------------------------------------------------- */

interface TextAreaFieldProps {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}

export function TextAreaField({
  value,
  onChange,
  rows = 3,
  placeholder,
}: TextAreaFieldProps) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full resize-none rounded-md border border-border bg-surface px-2 py-1.5 text-xs leading-relaxed outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
    />
  );
}

/* -------------------------------------------------------------------- */
/* Toggle group (e.g. alignment)                                        */
/* -------------------------------------------------------------------- */

interface ToggleGroupOption {
  value: string;
  label: React.ReactNode;
  hint?: string;
}

interface ToggleGroupProps {
  value: string;
  onChange: (v: string) => void;
  options: ToggleGroupOption[];
}

export function ToggleGroup({ value, onChange, options }: ToggleGroupProps) {
  return (
    <div className="inline-flex h-7 w-full rounded-md border border-border bg-surface p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            title={o.hint}
            className={cn(
              "flex-1 flex items-center justify-center rounded text-[11px] transition-colors",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
