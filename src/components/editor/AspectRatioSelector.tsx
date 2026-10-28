"use client";

import { useT } from "@/components/locale-provider";
import { useId } from "react";
import type { AspectRatio } from "@/types/carousel";
import { cn } from "@/lib/utils";

interface AspectRatioSelectorProps {
  value: AspectRatio;
  onChange: (ratio: AspectRatio) => void;
  /** Names the group for screen readers. */
  label?: string;
  className?: string;
}

const RATIOS: {
  value: AspectRatio;
  label: string;
  icon: { w: number; h: number };
}[] = [
  { value: "1:1", label: "Square", icon: { w: 16, h: 16 } },
  { value: "4:5", label: "Portrait", icon: { w: 15, h: 19 } },
  { value: "9:16", label: "Story", icon: { w: 12, h: 20 } },
];

/**
 * ponytail: hidden native radios. This used to be three loose buttons with no
 * group semantics; radios give arrow-key navigation and the "1 of 3 selected"
 * announcement for free.
 */
export function AspectRatioSelector({
  value,
  onChange,
  label = "Aspect ratio",
  className,
}: AspectRatioSelectorProps) {
  const name = useId();
  const t = useT();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("flex items-center gap-1.5", className)}
    >
      {RATIOS.map((ratio) => {
        const checked = value === ratio.value;
        return (
          <label
            key={ratio.value}
            title={`${t(ratio.label)} (${ratio.value})`}
            // A row, not a stack: stacked it measured 64px and the editor's
            // 40px toolbar clipped it (and grew a scrollbar around it).
            className={cn(
              "oc-press flex h-control cursor-pointer items-center justify-center gap-2 rounded-md px-2.5 text-label font-medium",
              "has-[:focus-visible]:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--ring)]",
              checked
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <input
              type="radio"
              name={name}
              value={ratio.value}
              checked={checked}
              onChange={() => onChange(ratio.value)}
              className="sr-only"
            />
            <span
              aria-hidden
              className={cn(
                "rounded-xs border-2",
                checked ? "border-background" : "border-current"
              )}
              style={{ width: ratio.icon.w, height: ratio.icon.h }}
            />
            <span>{ratio.value}</span>
            <span className="sr-only">{ratio.label}</span>
          </label>
        );
      })}
    </div>
  );
}
