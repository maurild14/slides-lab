"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/* ---------------------------------------------------------- segmented */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface SegmentedProps<T extends string> {
  /** Names the group for screen readers. Required — a bare row of icons isn't. */
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  /** Hide the text labels. Only for a toolbar where space is genuinely tight
   *  and the icons are unambiguous — never for navigation. */
  iconOnly?: boolean;
  className?: string;
}

/**
 * Row of mutually exclusive options.
 *
 * ponytail: real radio inputs, visually hidden. Arrow-key navigation, the
 * roving tab stop and the screen-reader group semantics all come from the
 * browser; a div-based version would have to reimplement all three.
 */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  iconOnly = false,
  className,
}: SegmentedProps<T>) {
  const name = React.useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "flex h-control w-full items-center gap-0.5 rounded-md bg-muted p-0.5",
        className
      )}
    >
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <label
            key={o.value}
            title={o.label}
            className={cn(
              "oc-press relative flex h-full flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-sm px-2 text-label font-medium",
              "has-[:focus-visible]:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--ring)]",
              checked
                ? "bg-surface text-foreground shadow-rest"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={checked}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.icon}
            {o.icon && iconOnly ? (
              <span className="sr-only">{o.label}</span>
            ) : (
              o.label
            )}
          </label>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------- slider */

interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  className?: string;
}

/**
 * ponytail: native <input type="range">. Keyboard, touch and screen-reader
 * support are all built in. Swap for a custom track only if a range needs
 * two thumbs.
 */
export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  suffix,
  className,
}: SliderProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <input
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="oc-focus h-control flex-1 cursor-pointer accent-accent"
      />
      <span className="w-12 shrink-0 text-right text-label tabular-nums text-muted-foreground">
        {Math.round(value)}
        {suffix}
      </span>
    </div>
  );
}

/* -------------------------------------------------------- number input */

interface NumberInputProps {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  className?: string;
}

/**
 * Number field with drag-to-scrub, the way design tools do it: press the
 * suffix and drag sideways to change the value without selecting text.
 * Typing and arrow keys work as usual because it stays a native number input.
 */
export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  className,
}: NumberInputProps) {
  const clamp = (n: number) => {
    if (min !== undefined && n < min) return min;
    if (max !== undefined && n > max) return max;
    return n;
  };

  const startScrub = (e: React.PointerEvent) => {
    if (value === null) return;
    e.preventDefault();
    const startX = e.clientX;
    const startValue = value;

    const onMove = (ev: PointerEvent) => {
      // Shift gives fine control; the raw pixel delta is too coarse for
      // font sizes and too slow for coordinates otherwise.
      const scale = ev.shiftKey ? 0.25 : 1;
      onChange(clamp(Math.round(startValue + (ev.clientX - startX) * step * scale)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "ew-resize";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className={cn(
        "oc-field flex h-control items-center rounded-md border border-border bg-surface pl-3 hover:border-muted-foreground/40 has-[:focus-visible]:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--ring)]",
        className
      )}
    >
      <input
        type="number"
        aria-label={label}
        value={value ?? ""}
        min={min}
        max={max}
        step={step}
        placeholder="—"
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(clamp(n));
        }}
        className="w-full min-w-0 bg-transparent text-body tabular-nums text-foreground outline-none placeholder:text-muted-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {suffix && (
        <span
          onPointerDown={startScrub}
          title={`Arrastrá para cambiar ${label.toLowerCase()}`}
          className="flex h-full shrink-0 cursor-ew-resize touch-none select-none items-center px-2.5 text-micro text-muted-foreground hover:text-foreground"
        >
          {suffix}
        </span>
      )}
    </div>
  );
}

/* --------------------------------------------------------- color input */

interface ColorInputProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  /** Brand palette shown above the picker. */
  swatches?: { color: string; name: string }[];
  className?: string;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function ColorInput({
  label,
  value,
  onChange,
  swatches = [],
  className,
}: ColorInputProps) {
  const [draft, setDraft] = React.useState(value);
  const [lastValue, setLastValue] = React.useState(value);

  // Re-sync when the selection changes underneath us, without an effect.
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }

  const commit = (next: string) => {
    setDraft(next);
    if (HEX.test(next)) onChange(next.toLowerCase());
  };

  return (
    <div
      className={cn(
        "oc-field flex h-control items-center gap-2 rounded-md border border-border bg-surface pl-1.5 pr-3 hover:border-muted-foreground/40 has-[:focus-visible]:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--ring)]",
        className
      )}
    >
      <Popover>
        <PopoverTrigger
          aria-label={`${label}: elegir color`}
          className="oc-focus h-7 w-7 shrink-0 cursor-pointer rounded-sm border border-black/10"
          style={{ background: HEX.test(draft) ? draft : "transparent" }}
        />
        <PopoverContent className="w-56 space-y-3">
          {swatches.length > 0 && (
            <div>
              <p className="mb-2 text-label font-medium">Colores de marca</p>
              <div className="flex flex-wrap gap-1.5">
                {swatches.map((s) => (
                  <button
                    key={s.color}
                    type="button"
                    onClick={() => commit(s.color)}
                    aria-label={s.name}
                    title={s.name}
                    className="oc-focus oc-press h-7 w-7 cursor-pointer rounded-sm border border-black/10"
                    style={{ background: s.color }}
                  />
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="mb-2 text-label font-medium">Personalizado</p>
            <input
              type="color"
              aria-label={`${label}: selector de color`}
              value={HEX.test(draft) ? draft : "#000000"}
              onChange={(e) => commit(e.target.value)}
              className="oc-focus h-control-lg w-full cursor-pointer rounded-md border border-border bg-surface p-1"
            />
          </div>
        </PopoverContent>
      </Popover>
      <input
        aria-label={label}
        value={draft}
        onChange={(e) => commit(e.target.value)}
        spellCheck={false}
        className="w-full min-w-0 bg-transparent font-mono text-label uppercase text-foreground outline-none"
      />
    </div>
  );
}
