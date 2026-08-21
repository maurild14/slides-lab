"use client";

import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuShortcut,
  MenuTrigger,
} from "@/components/ui/menu";
import type { CanvasCommands } from "./canvas-commands";

interface CanvasContextMenuProps {
  /** Viewport position of the right-click, or null when closed. */
  at: { x: number; y: number } | null;
  onClose: () => void;
  commands: CanvasCommands;
  onUndo: () => void;
  onRedo: () => void;
}

/**
 * ponytail: the dropdown primitive anchored to a zero-size element at the
 * click point, not Radix's context menu. The right-click happens inside the
 * iframe, so its own trigger — which listens for `contextmenu` on a DOM node in
 * *this* document — would never fire.
 */
export function CanvasContextMenu({
  at,
  onClose,
  commands,
  onUndo,
  onRedo,
}: CanvasContextMenuProps) {
  const has = commands.count > 0;

  return (
    <Menu open={at !== null} onOpenChange={(open) => !open && onClose()}>
      <MenuTrigger asChild>
        <span
          aria-hidden
          className="fixed"
          style={{
            left: at?.x ?? 0,
            top: at?.y ?? 0,
            width: 1,
            height: 1,
            pointerEvents: "none",
            zIndex: "var(--z-overlay)",
          }}
        />
      </MenuTrigger>
      <MenuContent align="start" sideOffset={2}>
        {has ? (
          <>
            <MenuItem onSelect={commands.duplicate} disabled={commands.locked}>
              Duplicar
              <MenuShortcut>Ctrl D</MenuShortcut>
            </MenuItem>
            <MenuItem onSelect={commands.copy}>
              Copiar
              <MenuShortcut>Ctrl C</MenuShortcut>
            </MenuItem>
            <MenuItem onSelect={commands.cut} disabled={commands.locked}>
              Cortar
              <MenuShortcut>Ctrl X</MenuShortcut>
            </MenuItem>
            <MenuItem onSelect={commands.paste} disabled={!commands.hasClipboard}>
              Pegar
              <MenuShortcut>Ctrl V</MenuShortcut>
            </MenuItem>

            <MenuSeparator />

            <MenuItem onSelect={() => commands.order("front")} disabled={commands.locked}>
              Traer al frente
              <MenuShortcut>Ctrl ⇧ ]</MenuShortcut>
            </MenuItem>
            <MenuItem onSelect={() => commands.order("forward")} disabled={commands.locked}>
              Traer adelante
              <MenuShortcut>Ctrl ]</MenuShortcut>
            </MenuItem>
            <MenuItem onSelect={() => commands.order("backward")} disabled={commands.locked}>
              Enviar atrás
              <MenuShortcut>Ctrl [</MenuShortcut>
            </MenuItem>
            <MenuItem onSelect={() => commands.order("back")} disabled={commands.locked}>
              Enviar al fondo
              <MenuShortcut>Ctrl ⇧ [</MenuShortcut>
            </MenuItem>

            <MenuSeparator />

            {commands.canGroup && (
              <MenuItem onSelect={commands.group}>
                Agrupar
                <MenuShortcut>Ctrl G</MenuShortcut>
              </MenuItem>
            )}
            {commands.canUngroup && (
              <MenuItem onSelect={commands.ungroup}>
                Desagrupar
                <MenuShortcut>Ctrl ⇧ G</MenuShortcut>
              </MenuItem>
            )}
            <MenuItem onSelect={commands.toggleLock}>
              {commands.locked ? "Desbloquear" : "Bloquear"}
              <MenuShortcut>Ctrl L</MenuShortcut>
            </MenuItem>

            <MenuSeparator />

            <MenuItem destructive onSelect={commands.remove} disabled={commands.locked}>
              Eliminar
              <MenuShortcut>Supr</MenuShortcut>
            </MenuItem>
          </>
        ) : (
          <>
            <MenuItem onSelect={commands.paste} disabled={!commands.hasClipboard}>
              Pegar
              <MenuShortcut>Ctrl V</MenuShortcut>
            </MenuItem>
            <MenuItem onSelect={commands.selectAll}>
              Seleccionar todo
              <MenuShortcut>Ctrl A</MenuShortcut>
            </MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={onUndo}>
              Deshacer
              <MenuShortcut>Ctrl Z</MenuShortcut>
            </MenuItem>
            <MenuItem onSelect={onRedo}>
              Rehacer
              <MenuShortcut>Ctrl ⇧ Z</MenuShortcut>
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}
