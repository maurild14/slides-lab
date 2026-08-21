"use client";

import { useState } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  Copy,
  Group,
  Keyboard,
  Layers,
  Lock,
  Maximize,
  Minus,
  Plus,
  Redo2,
  Trash2,
  Ungroup,
  Unlock,
  Undo2,
} from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { DialogShell, DialogIcon } from "@/components/ui/dialog";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuShortcut,
  MenuTrigger,
} from "@/components/ui/menu";
import { MAX_ZOOM, MIN_ZOOM } from "@/lib/canvas-utils";
import type { CanvasCommands } from "./canvas-commands";

const ZOOM_PRESETS = [0.5, 1, 2, 4];

interface CanvasToolbarProps {
  scale: number;
  onZoomTo: (scale: number) => void;
  onZoomBy: (factor: number) => void;
  onFit: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  commands: CanvasCommands;
  saving: boolean;
  /** False while the AI is rewriting this slide. */
  enabled: boolean;
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
  commands,
  saving,
  enabled,
}: CanvasToolbarProps) {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const hasSelection = commands.count > 0 && enabled;


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

      {hasSelection && (
        <>
          <Divider />

          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5">
                <AlignCenterHorizontal className="h-4 w-4" aria-hidden />
                Alinear
                <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
              </Button>
            </MenuTrigger>
            <MenuContent align="start">
              <MenuLabel>
                {commands.count === 1 ? "Respecto del slide" : "Respecto de la selección"}
              </MenuLabel>
              <MenuItem onSelect={() => commands.align("left")}>
                <AlignStartVertical className="h-4 w-4" aria-hidden />
                Izquierda
              </MenuItem>
              <MenuItem onSelect={() => commands.align("center-h")}>
                <AlignCenterVertical className="h-4 w-4" aria-hidden />
                Centro horizontal
              </MenuItem>
              <MenuItem onSelect={() => commands.align("right")}>
                <AlignEndVertical className="h-4 w-4" aria-hidden />
                Derecha
              </MenuItem>
              <MenuSeparator />
              <MenuItem onSelect={() => commands.align("top")}>
                <AlignStartHorizontal className="h-4 w-4" aria-hidden />
                Arriba
              </MenuItem>
              <MenuItem onSelect={() => commands.align("center-v")}>
                <AlignCenterHorizontal className="h-4 w-4" aria-hidden />
                Centro vertical
              </MenuItem>
              <MenuItem onSelect={() => commands.align("bottom")}>
                <AlignEndHorizontal className="h-4 w-4" aria-hidden />
                Abajo
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                onSelect={() => commands.distribute("x")}
                disabled={!commands.canDistribute}
              >
                Distribuir en horizontal
              </MenuItem>
              <MenuItem
                onSelect={() => commands.distribute("y")}
                disabled={!commands.canDistribute}
              >
                Distribuir en vertical
              </MenuItem>
            </MenuContent>
          </Menu>

          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5">
                <Layers className="h-4 w-4" aria-hidden />
                Capa
                <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
              </Button>
            </MenuTrigger>
            <MenuContent align="start">
              <MenuItem onSelect={() => commands.order("front")}>
                <ArrowUpToLine className="h-4 w-4" aria-hidden />
                Traer al frente
                <MenuShortcut>Ctrl ⇧ ]</MenuShortcut>
              </MenuItem>
              <MenuItem onSelect={() => commands.order("forward")}>
                Traer adelante
                <MenuShortcut>Ctrl ]</MenuShortcut>
              </MenuItem>
              <MenuItem onSelect={() => commands.order("backward")}>
                Enviar atrás
                <MenuShortcut>Ctrl [</MenuShortcut>
              </MenuItem>
              <MenuItem onSelect={() => commands.order("back")}>
                <ArrowDownToLine className="h-4 w-4" aria-hidden />
                Enviar al fondo
                <MenuShortcut>Ctrl ⇧ [</MenuShortcut>
              </MenuItem>
            </MenuContent>
          </Menu>

          {commands.canGroup && (
            <IconButton label="Agrupar (Ctrl G)" size="sm" onClick={commands.group}>
              <Group className="h-4 w-4" aria-hidden />
            </IconButton>
          )}
          {commands.canUngroup && (
            <IconButton
              label="Desagrupar (Ctrl ⇧ G)"
              size="sm"
              onClick={commands.ungroup}
            >
              <Ungroup className="h-4 w-4" aria-hidden />
            </IconButton>
          )}
          <IconButton
            label={commands.locked ? "Desbloquear (Ctrl L)" : "Bloquear (Ctrl L)"}
            size="sm"
            active={commands.locked}
            onClick={commands.toggleLock}
          >
            {commands.locked ? (
              <Lock className="h-4 w-4" aria-hidden />
            ) : (
              <Unlock className="h-4 w-4" aria-hidden />
            )}
          </IconButton>
          <IconButton
            label="Duplicar (Ctrl D)"
            size="sm"
            onClick={commands.duplicate}
            disabled={commands.locked}
          >
            <Copy className="h-4 w-4" aria-hidden />
          </IconButton>
          <IconButton
            label="Eliminar (Supr)"
            size="sm"
            onClick={commands.remove}
            disabled={commands.locked}
            className="hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </IconButton>
        </>
      )}

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
