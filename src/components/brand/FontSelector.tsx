"use client";

import { useState, useEffect, useId } from "react";
import { ChevronDown } from "lucide-react";

interface Font {
  name: string;
  category: string;
}

interface FontSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function FontSelector({ label, value, onChange }: FontSelectorProps) {
  const id = useId();
  const [fonts, setFonts] = useState<Font[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/fonts")
      .then((r) => r.json())
      .then((data) => setFonts(data.fonts || []))
      .catch(() => setFailed(true));
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-label font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="oc-focus h-control w-full cursor-pointer appearance-none rounded-md border border-border bg-surface px-3 pr-9 text-body text-foreground hover:border-muted-foreground/40"
        >
          {/* The stored family may not be in the catalogue (or the catalogue may
              have failed to load): keep it selectable either way. */}
          {!fonts.some((f) => f.name === value) && (
            <option value={value}>{value}</option>
          )}
          {fonts.map((font) => (
            <option key={font.name} value={font.name}>
              {font.name} ({font.category})
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
      </div>
      {failed && (
        <p role="alert" className="text-micro text-destructive">
          No se pudo cargar la lista de fuentes. Podés escribir el nombre igual.
        </p>
      )}
      <p
        className="mt-1 text-body text-muted-foreground"
        style={{ fontFamily: `'${value}', sans-serif` }}
      >
        El veloz murciélago hindú comía feliz cardillo y kiwi
      </p>
    </div>
  );
}
