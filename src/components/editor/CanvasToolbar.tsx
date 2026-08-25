"use client";

import { useState } from "react";
import {
  ChevronDown,
  Keyboard,
  Maximize,
  Minus,
  Plus,
  Redo2,
  Undo2,
} from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { DialogShell, DialogIcon } from "@/components/ui/dialog";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuShortcut,
  MenuTrigger,
} from "@/components/ui/menu";
import { MAX_ZOOM, MIN_ZOOM } from "@/lib/canvas-utils";

const ZOOM_PRESETS = [0.5, 1, 2, 4];

/**
 * What is true of the whole canvas: history, zoom, and the shortcut sheet.
 *
 * Nothing here depends on the selection. Alinear, capa, agrupar, bloquear,
 * duplicar and eliminar used to live here *as well as* in the contextual row
 * right below — the same trash icon twice, 40px apart — and their appearing
 * shoved the rest of this row sideways on every click.
 */
interface CanvasToolbarProps {
  scale: number;
  onZoomTo: (scale: number) => void;
  onZoomBy: (factor: number) => void;
  onFit: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  saving: boolean;
}

export function CanvasToolbar({
  scale,
  onZoomTo,
  onZoomBy,
  onFit,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  saving,
}: CanvasToolbarProps) {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  return (
    <div className="flex items-center gap-1">
      <IconButton
        label="Deshacer (Ctrl Z)"
        size="sm"
        onClick={onUndo}
        disabled={!canUndo}
      >
        <Undo2 className="h-4 w-4" aria-hidden />
      </IconButton>
      <IconButton
        label="Rehacer (Ctrl ⇧ Z)"
        size="sm"
        onClick={onRedo}
        disabled={!canRedo}
      >
        <Redo2 className="h-4 w-4" aria-hidden />
      </IconButton>

      <Divider />

      <IconButton
        label="Alejar (Ctrl −)"
        size="sm"
        onClick={() => onZoomBy(1 / 1.25)}
        disabled={scale <= MIN_ZOOM}
      >
        <Minus className="h-4 w-4" aria-hidden />
      </IconButton>
      <Menu>
        <MenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="min-w-16 gap-1 tabular-nums"
            aria-label={`Zoom, ${Math.round(scale * 100)} por ciento`}
          >
            {Math.round(scale * 100)}%
            <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
          </Button>
        </MenuTrigger>
        <MenuContent align="start">
          <MenuItem onSelect={onFit}>
            Ajustar a la pantalla
            <MenuShortcut>Ctrl 0</MenuShortcut>
          </MenuItem>
          <MenuSeparator />
          {ZOOM_PRESETS.map((preset) => (
            <MenuItem key={preset} onSelect={() => onZoomTo(preset)}>
              {preset * 100}%
              {preset === 1 && <MenuShortcut>Ctrl 1</MenuShortcut>}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
      <IconButton
        label="Acercar (Ctrl +)"
        size="sm"
        onClick={() => onZoomBy(1.25)}
        disabled={scale >= MAX_ZOOM}
      >
        <Plus className="h-4 w-4" aria-hidden />
      </IconButton>
      <IconButton label="Ajustar a la pantalla (Ctrl 0)" size="sm" onClick={onFit}>
        <Maximize className="h-4 w-4" aria-hidden />
      </IconButton>

      <Divider />

      <IconButton
        label="Atajos de teclado"
        size="sm"
        onClick={() => setShortcutsOpen(true)}
      >
        <Keyboard className="h-4 w-4" aria-hidden />
      </IconButton>

      {/* Autosave is the only save path now that the edit mode is gone, so it
          has to say so out loud rather than happening invisibly. */}
      <span
        aria-live="polite"
        className="w-16 shrink-0 text-micro text-muted-foreground"
      >
        {saving ? "Guardando…" : ""}
      </span>

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />;
}

const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: "Edición",
    items: [
      ["Ctrl Z", "Deshacer"],
      ["Ctrl ⇧ Z", "Rehacer"],
      ["Ctrl D", "Duplicar"],
      ["Ctrl C / X / V", "Copiar, cortar, pegar"],
      ["Supr", "Eliminar"],
      ["Alt + arrastrar", "Duplicar mientras movés"],
    ],
  },
  {
    group: "Selección",
    items: [
      ["Clic", "Seleccionar"],
      ["⇧ + clic", "Sumar o quitar de la selección"],
      ["Arrastrar en vacío", "Selección por área"],
      ["Ctrl A", "Seleccionar todo"],
      ["Tab / ⇧ Tab", "Recorrer elementos"],
      ["Esc", "Deseleccionar"],
    ],
  },
  {
    group: "Mover y transformar",
    items: [
      ["Flechas", "Mover 1 px"],
      ["⇧ + flechas", "Mover 10 px"],
      ["⇧ al arrastrar", "Restringir a un eje"],
      ["⇧ al rotar", "Saltos de 15°"],
      ["⇧ al escalar", "Invertir el bloqueo de proporción"],
      ["Ctrl G / Ctrl ⇧ G", "Agrupar y desagrupar"],
      ["Ctrl L", "Bloquear y desbloquear"],
      ["Ctrl ] / Ctrl [", "Orden de capa"],
    ],
  },
  {
    group: "Lienzo",
    items: [
      ["Ctrl + rueda", "Acercar sobre el puntero"],
      ["Rueda / ⇧ rueda", "Desplazar"],
      ["Espacio + arrastrar", "Mover el lienzo"],
      ["Botón del medio", "Mover el lienzo"],
      ["Ctrl 0", "Ajustar a la pantalla"],
      ["Ctrl 1", "Tamaño real"],
    ],
  },
];

function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Atajos de teclado"
      description="Todo lo que se puede hacer sin soltar el teclado."
      className="max-w-2xl"
      icon={
        <DialogIcon>
          <Keyboard className="h-5 w-5" />
        </DialogIcon>
      }
    >
      <div className="grid max-h-[60vh] grid-cols-2 gap-x-8 gap-y-6 overflow-y-auto pr-1">
        {SHORTCUTS.map((section) => (
          <section key={section.group}>
            <h3 className="mb-2 text-label font-semibold text-muted-foreground">
              {section.group}
            </h3>
            <dl className="space-y-1.5">
              {section.items.map(([keys, what]) => (
                <div key={keys} className="flex items-baseline justify-between gap-4">
                  <dt className="text-body">{what}</dt>
                  <dd className="shrink-0 rounded-sm border border-border-subtle bg-muted px-1.5 py-0.5 text-micro tabular-nums text-muted-foreground">
                    {keys}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </DialogShell>
  );
}
