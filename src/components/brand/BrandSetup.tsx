"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronRight, ChevronLeft, Check, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { DialogShell, DialogIcon } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useT } from "@/components/locale-provider";
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

/** Stored on the brand as-is and read by the agent, so the values stay English. Labels go through t(). */
const STYLE_OPTIONS: { value: string; label: string }[] = [
  { value: "minimal", label: "Minimal" },
  { value: "bold", label: "Bold" },
  { value: "playful", label: "Playful" },
  { value: "corporate", label: "Corporate" },
  { value: "luxury", label: "Luxury" },
  { value: "vintage", label: "Vintage" },
  { value: "modern", label: "Modern" },
  { value: "elegant", label: "Elegant" },
  { value: "creative", label: "Creative" },
  { value: "professional", label: "Professional" },
];

const STEPS = ["Name", "Colors", "Fonts", "Logo", "Style"];

const COLOR_FIELDS: { key: keyof BrandConfig["colors"]; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "accent", label: "Accent" },
  { key: "background", label: "Background" },
  { key: "surface", label: "Surface" },
];

export function BrandSetup({ open, onComplete, initialBrand }: BrandSetupProps) {
  const t = useT();
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
      setError(t("Couldn't save the brand. Check the server and try again."));
    } finally {
      setSaving(false);
    }
  }, [brand, onComplete, t]);

  const last = step === STEPS.length - 1;

  return (
    <DialogShell
      open={open}
      onOpenChange={(next) => {
        if (!next) onComplete();
      }}
      className="max-w-lg"
      title={t("Set up your brand")}
      description={t("Step {n} of {total}: {name}", { n: step + 1, total: STEPS.length, name: t(STEPS[step]) })}
      icon={
        <DialogIcon>
          <Palette className="h-5 w-5" />
        </DialogIcon>
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {t("Back")}
          </Button>
          <div className="flex-1" />
          {last ? (
            <Button
              variant="accent"
              onClick={handleSave}
              disabled={saving || !brand.name.trim()}
            >
              {saving ? (
                t("Saving…")
              ) : (
                <>
                  <Check className="h-4 w-4" aria-hidden />
                  {t("Done")}
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={step === 0 && !brand.name.trim()}
            >
              {t("Next")}
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
              label={t("What's your brand called?")}
              hint={t("The AI uses it to keep a consistent identity across every carousel.")}
            >
              <Input
                value={brand.name}
                onChange={(e) => setBrand({ ...brand, name: e.target.value })}
                placeholder={t("My brand")}
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
                label={t(label)}
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
              label={t("Heading font")}
              value={brand.fonts.heading}
              onChange={(v) =>
                setBrand({ ...brand, fonts: { ...brand.fonts, heading: v } })
              }
            />
            <FontSelector
              label={t("Body font")}
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
              {t("Pick your brand's style")}
            </legend>
            <p className="mb-3 mt-1 text-label text-muted-foreground">
              {t("You can pick several. They are the words the AI uses to describe your visual identity.")}
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
                    {t(label)}
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
