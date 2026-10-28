"use client";

import { useT } from "@/components/locale-provider";
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
  onApplyElementToAll?: () => void;
  onApplyBackgroundToAll?: () => void;
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
  onApplyElementToAll,
  onApplyBackgroundToAll,
}: CanvasContextMenuProps) {
  const t = useT();
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
              {t("Duplicate")}
              <MenuShortcut>Ctrl D</MenuShortcut>
            </MenuItem>
            <MenuItem onSelect={commands.copy}>
              {t("Copy")}
              <MenuShortcut>Ctrl C</MenuShortcut>
            </MenuItem>
            <MenuItem onSelect={commands.cut} disabled={commands.locked}>
              {t("Cut")}
              <MenuShortcut>Ctrl X</MenuShortcut>
            </MenuItem>
            <MenuItem onSelect={commands.paste} disabled={!commands.hasClipboard}>
              {t("Paste")}
              <MenuShortcut>Ctrl V</MenuShortcut>
            </MenuItem>

            <MenuSeparator />

            <MenuItem onSelect={commands.copyStyle} disabled={commands.count !== 1}>
              {t("Copy style")}
              <MenuShortcut>Ctrl ⌥ C</MenuShortcut>
            </MenuItem>
            <MenuItem
              onSelect={commands.pasteStyle}
              disabled={!commands.hasStyleClipboard || commands.locked}
            >
              {t("Paste style")}
              <MenuShortcut>Ctrl ⌥ V</MenuShortcut>
            </MenuItem>

            <MenuSeparator />

            <MenuItem onSelect={() => commands.order("front")} disabled={commands.locked}>
              {t("Bring to front")}
              <MenuShortcut>Ctrl ⇧ ]</MenuShortcut>
            </MenuItem>
            <MenuItem onSelect={() => commands.order("forward")} disabled={commands.locked}>
              {t("Bring forward")}
              <MenuShortcut>Ctrl ]</MenuShortcut>
            </MenuItem>
            <MenuItem onSelect={() => commands.order("backward")} disabled={commands.locked}>
              {t("Send backward")}
              <MenuShortcut>Ctrl [</MenuShortcut>
            </MenuItem>
            <MenuItem onSelect={() => commands.order("back")} disabled={commands.locked}>
              {t("Send to back")}
              <MenuShortcut>Ctrl ⇧ [</MenuShortcut>
            </MenuItem>

            <MenuSeparator />

            {commands.canGroup && (
              <MenuItem onSelect={commands.group}>
                {t("Group")}
                <MenuShortcut>Ctrl G</MenuShortcut>
              </MenuItem>
            )}
            {commands.canUngroup && (
              <MenuItem onSelect={commands.ungroup}>
                {t("Ungroup")}
                <MenuShortcut>Ctrl ⇧ G</MenuShortcut>
              </MenuItem>
            )}
            <MenuItem onSelect={commands.toggleLock}>
              {commands.locked ? t("Unlock") : t("Lock")}
              <MenuShortcut>Ctrl L</MenuShortcut>
            </MenuItem>

            {onApplyElementToAll && (
              <>
                <MenuSeparator />
                <MenuItem
                  onSelect={onApplyElementToAll}
                  disabled={commands.count !== 1}
                >
                  {t("Apply to all pages")}
                </MenuItem>
              </>
            )}

            <MenuSeparator />

            <MenuItem destructive onSelect={commands.remove} disabled={commands.locked}>
              {t("Delete")}
              <MenuShortcut>{t("Del")}</MenuShortcut>
            </MenuItem>
          </>
        ) : (
          <>
            <MenuItem onSelect={commands.paste} disabled={!commands.hasClipboard}>
              {t("Paste")}
              <MenuShortcut>Ctrl V</MenuShortcut>
            </MenuItem>
            <MenuItem onSelect={commands.selectAll}>
              {t("Select all")}
              <MenuShortcut>Ctrl A</MenuShortcut>
            </MenuItem>
            {onApplyBackgroundToAll && (
              <MenuItem onSelect={onApplyBackgroundToAll}>
                {t("Apply the background to all pages")}
              </MenuItem>
            )}
            <MenuSeparator />
            <MenuItem onSelect={onUndo}>
              {t("Undo")}
              <MenuShortcut>Ctrl Z</MenuShortcut>
            </MenuItem>
            <MenuItem onSelect={onRedo}>
              {t("Redo")}
              <MenuShortcut>Ctrl ⇧ Z</MenuShortcut>
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}
