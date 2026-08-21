"use client";

import { Trash2, ArrowRight } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { SlideRenderer } from "@/components/editor/SlideRenderer";
import type { Template } from "@/types/template";

interface TemplateCardProps {
  template: Template;
  onUse: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TemplateCard({ template, onUse, onDelete }: TemplateCardProps) {
  return (
    <li className="group flex list-none flex-col rounded-xl border border-border bg-surface p-4 shadow-rest transition-[translate,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] focus-within:border-accent/50 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-raised">
      <div className="mb-3 h-32 overflow-hidden rounded-lg bg-muted">
        {template.slides.length > 0 ? (
          <SlideRenderer
            html={template.slides[0].html}
            aspectRatio={template.aspectRatio}
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-label text-muted-foreground">
            Plantilla vacía
          </div>
        )}
      </div>

      <h3 className="truncate text-body font-semibold">{template.name}</h3>
      <p className="mt-0.5 truncate text-label text-muted-foreground">
        {template.slides.length} {template.slides.length === 1 ? "slide" : "slides"} ·{" "}
        {template.aspectRatio}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <Button variant="accent" size="sm" className="flex-1" onClick={() => onUse(template.id)}>
          Usar plantilla
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
        {/* Not hover-only: it has to be reachable with the keyboard too. */}
        <IconButton
          label={`Eliminar la plantilla ${template.name}`}
          size="sm"
          className="text-muted-foreground hover:bg-destructive hover:text-white"
          onClick={() => onDelete(template.id)}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </IconButton>
      </div>
    </li>
  );
}
