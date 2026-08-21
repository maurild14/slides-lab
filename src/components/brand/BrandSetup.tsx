"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronRight, ChevronLeft, Check, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { DialogShell, DialogIcon } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ColorPicker } from "./ColorPicker";
import { FontSelector } from "./FontSelector";
import { LogoUpload } from "./LogoUpload";
import type { BrandConfig } from "@/types/brand";
import { DEFAULT_BRAND } from "@/types/brand";

interface BrandSetupProps {
  open: boolean;
  onComplete: () => void;
  initialBrand?: BrandConfig;
}

/** Stored on the brand as-is and read by the agent, so the values stay English. */
const STYLE_OPTIONS: { value: string; label: string }[] = [
  { value: "minimal", label: "Minimalista" },
  { value: "bold", label: "Contundente" },
  { value: "playful", label: "Divertida" },
  { value: "corporate", label: "Corporativa" },
  { value: "luxury", label: "De lujo" },
  { value: "vintage", label: "Vintage" },
  { value: "modern", label: "Moderna" },
  { value: "elegant", label: "Elegante" },
  { value: "creative", label: "Creativa" },
  { value: "professional", label: "Profesional" },
];

const STEPS = ["Nombre", "Colores", "Tipografías", "Logo", "Estilo"];

const COLOR_FIELDS: { key: keyof BrandConfig["colors"]; label: string }[] = [
  { key: "primary", label: "Primario" },
  { key: "secondary", label: "Secundario" },
  { key: "accent", label: "Acento" },
  { key: "background", label: "Fondo" },
  { key: "surface", label: "Superficie" },
];

export function BrandSetup({ open, onComplete, initialBrand }: BrandSetupProps) {
  const [step, setStep] = useState(0);
  const [brand, setBrand] = useState<BrandConfig>(initialBrand || DEFAULT_BRAND);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialBrand) setBrand(initialBrand);
  }, [initialBrand]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/brand", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brand),
      });
      if (!res.ok) throw new Error();
      onComplete();
    } catch {
      setError("No se pudo guardar la marca. Revisá el servidor y probá de nuevo.");
    } finally {
      setSaving(false);
    }
  }, [brand, onComplete]);

  const last = step === STEPS.length - 1;

  return (
    <DialogShell
      open={open}
      onOpenChange={(next) => {
        if (!next) onComplete();
      }}
      className="max-w-lg"
      title="Configurá tu marca"
      description={`Paso ${step + 1} de ${STEPS.length}: ${STEPS[step]}`}
      icon={
        <DialogIcon>
          <Palette className="h-5 w-5" />
        </DialogIcon>
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Atrás
          </Button>
          <div className="flex-1" />
          {last ? (
            <Button
              variant="accent"
              onClick={handleSave}
              disabled={saving || !brand.name.trim()}
            >
              {saving ? (
                "Guardando…"
              ) : (
                <>
                  <Check className="h-4 w-4" aria-hidden />
                  Listo
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={step === 0 && !brand.name.trim()}
            >
              Siguiente
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </>
      }
    >
      {/* Progress: the same five steps the description names, as a shape. */}
      <div className="flex gap-1" aria-hidden>
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i <= step ? "bg-accent" : "bg-muted"
            )}
          />
        ))}
      </div>

      <div className="min-h-[15rem]">
        {step === 0 && (
          <div className="space-y-1">
            <Field
              label="¿Cómo se llama tu marca?"
              hint="La IA la usa para mantener una identidad consistente en todos los carruseles."
            >
              <Input
                value={brand.name}
                onChange={(e) => setBrand({ ...brand, name: e.target.value })}
                placeholder="Mi marca"
                className="h-control-lg text-title"
                autoFocus
              />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            {COLOR_FIELDS.map(({ key, label }) => (
              <ColorPicker
                key={key}
                label={label}
                value={brand.colors[key]}
                onChange={(v) =>
                  setBrand({ ...brand, colors: { ...brand.colors, [key]: v } })
                }
              />
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <FontSelector
              label="Tipografía de títulos"
              value={brand.fonts.heading}
              onChange={(v) =>
                setBrand({ ...brand, fonts: { ...brand.fonts, heading: v } })
              }
            />
            <FontSelector
              label="Tipografía de texto"
              value={brand.fonts.body}
              onChange={(v) => setBrand({ ...brand, fonts: { ...brand.fonts, body: v } })}
            />
          </div>
        )}

        {step === 3 && (
          <LogoUpload
            value={brand.logoPath}
            onChange={(path) => setBrand({ ...brand, logoPath: path })}
          />
        )}

        {step === 4 && (
          <fieldset>
            <legend className="text-label font-medium text-foreground">
              Elegí el estilo de tu marca
            </legend>
            <p className="mb-3 mt-1 text-label text-muted-foreground">
              Podés marcar varias. Son las palabras con las que la IA describe tu
              identidad visual.
            </p>
            <div className="flex flex-wrap gap-2">
              {STYLE_OPTIONS.map(({ value, label }) => {
                const on = brand.styleKeywords.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setBrand({
                        ...brand,
                        styleKeywords: on
                          ? brand.styleKeywords.filter((k) => k !== value)
                          : [...brand.styleKeywords, value],
                      })
                    }
                    className={cn(
                      "oc-press oc-focus oc-hit flex h-control cursor-pointer items-center rounded-full border px-4 text-label font-medium",
                      on
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-surface text-foreground hover:border-muted-foreground"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
      </div>

      {error && (
        <p role="alert" className="text-label text-destructive">
          {error}
        </p>
      )}
    </DialogShell>
  );
}
