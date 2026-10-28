"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { useT } from "@/components/locale-provider";

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  const id = useId();
  const t = useT();
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-3">
      {/* The native picker sits invisible over its own swatch: one control,
          not a swatch plus a hidden input somewhere else. */}
      <div className="relative h-control-lg w-control-lg">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="oc-focus absolute inset-0 h-full w-full cursor-pointer rounded-md opacity-0"
          aria-label={t("Pick the {label} color", { label: label.toLowerCase() })}
        />
        <div
          aria-hidden
          className="pointer-events-none h-full w-full rounded-md border border-border shadow-rest"
          style={{ backgroundColor: value }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-label font-medium text-foreground">
          {label}
        </label>
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-control-sm font-mono text-label"
          placeholder="#000000"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
