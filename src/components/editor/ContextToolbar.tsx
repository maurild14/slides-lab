"use client";

import { useT } from "@/components/locale-provider";
import { useMemo } from "react";
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  ChevronDown,
  Copy,
  Crop,
  Files,
  Group,
  Image as ImageIcon,
  Italic,
  Layers,
  Lock,
  Move,
  Paintbrush,
  PaintBucket,
  Sparkles,
  SlidersHorizontal,
  Square,
  Trash2,
  Type as TypeIcon,
  Underline,
  Ungroup,
  Unlock,
} from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { ColorInput, NumberInput, Segmented, Slider } from "@/components/ui/controls";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuShortcut,
  MenuTrigger,
} from "@/components/ui/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FONT_PAIRS, elementKind } from "@/lib/slide-elements";
import { useElementStyle } from "./inspector/use-element-style";
import type { CanvasCommands } from "./canvas-commands";

interface Props {
  /** The single selected element, or null for zero or several. */
  element: HTMLElement | null;
  selectionCount: number;
  /** Page mutation counter — the DOM is the model, so re-read on every write. */
  tick: number;
  onMutate: () => void;
  commands: CanvasCommands;
  enabled: boolean;
  swatches: { color: string; name: string }[];
  brandFonts: string[];
  /** Open a section of the advanced panel on the right. */
  onOpenAdvanced: (section: string) => void;
  /** Jump the left rail to the image panel. */
  onOpenImages: () => void;
  /** Copy the selected element onto every other slide. Absent when alone. */
  onApplyToAll?: () => void;
}

/**
 * The bar for whatever is selected.
 *
 * It is a fixed row above the canvas, not a bubble that follows the selection:
 * a bubble hides elements near the top of the slide and moves every control
 * out from under the cursor between one click and the next. The row is always
 * there, so its buttons are always in the same place.
 *
 * It carries what you reach for constantly and nothing else; everything with
 * a slider or a preview lives one click away in the advanced panel.
 */
export function ContextToolbar({
  element,
  selectionCount,
  tick,
  onMutate,
  commands,
  enabled,
  swatches,
  brandFonts,
  onOpenAdvanced,
  onOpenImages,
  onApplyToAll,
}: Props) {
  const t = useT();
  const api = useElementStyle(element, tick, onMutate);
  const props = api.props;
  const { setStyle } = api;

  const fonts = useMemo(() => {
    const all = [...brandFonts, ...FONT_PAIRS.flatMap((p) => [p.heading, p.body])];
    return Array.from(new Set(all.filter(Boolean)));
  }, [brandFonts]);

  const kind = element ? elementKind(element) : null;
  const locked = commands.locked;
  const idle = !enabled || selectionCount === 0;

  return (
    <div
      role="toolbar"
      aria-label={t("Actions for the selected element")}
      // The row keeps its height even when empty. Letting it collapse would
      // shift the canvas — and its zoom — on every click.
      className="flex h-11 shrink-0 items-center border-b border-border bg-surface px-2"
    >
      {idle ? (
        <p className="text-label text-muted-foreground">
          {t("Select something on the slide to edit it here.")}
        </p>
      ) : (
      <div
        // The padding is inside the scroller on purpose: it clips at its own
        // padding box, so this is what keeps the focus rings visible.
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1"
      >
        {selectionCount > 1 ? (
          <MultiControls commands={commands} />
        ) : !props ? null : kind === "text" || kind === "icon" ? (
          <>
            {kind === "text" && (
              <>
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="max-w-40 gap-1">
                      <TypeIcon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="truncate">{props.fontFamily || "Fuente"}</span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                    </Button>
                  </MenuTrigger>
                  <MenuContent align="start">
                    <MenuLabel>{t("Font")}</MenuLabel>
                    {fonts.map((font) => (
                      <MenuItem
                        key={font}
                        onSelect={() => setStyle({ "font-family": `"${font}"` })}
                      >
                        <span style={{ fontFamily: `"${font}", sans-serif` }}>{font}</span>
                      </MenuItem>
                    ))}
                  </MenuContent>
                </Menu>

                <NumberInput
                  label={t("Font size")}
                  value={props.fontSize}
                  min={8}
                  max={400}
                  suffix="px"
                  className="w-24"
                  onChange={(n) => setStyle({ "font-size": `${n}px` })}
                />

                <Divider />

                <IconButton
                  label={t("Bold")}
                  size="sm"
                  active={Number.parseInt(props.fontWeight, 10) >= 600}
                  onClick={() =>
                    setStyle({
                      "font-weight":
                        Number.parseInt(props.fontWeight, 10) >= 600 ? "400" : "700",
                    })
                  }
                >
                  <Bold className="h-4 w-4" aria-hidden />
                </IconButton>
                <IconButton
                  label={t("Italic")}
                  size="sm"
                  active={props.italic}
                  onClick={() =>
                    setStyle({ "font-style": props.italic ? "normal" : "italic" })
                  }
                >
                  <Italic className="h-4 w-4" aria-hidden />
                </IconButton>
                <IconButton
                  label={t("Underline")}
                  size="sm"
                  active={props.underline}
                  onClick={() =>
                    setStyle({ "text-decoration": props.underline ? "none" : "underline" })
                  }
                >
                  <Underline className="h-4 w-4" aria-hidden />
                </IconButton>

                <Segmented
                  label={t("Text alignment")}
                  iconOnly
                  className="w-28"
                  value={
                    ["left", "center", "right"].includes(props.textAlign)
                      ? (props.textAlign as "left" | "center" | "right")
                      : "left"
                  }
                  onChange={(v) => setStyle({ "text-align": v })}
                  options={[
                    { value: "left", label: t("Left"), icon: <AlignLeft className="h-4 w-4" /> },
                    { value: "center", label: t("Center"), icon: <AlignCenter className="h-4 w-4" /> },
                    { value: "right", label: t("Right"), icon: <AlignRight className="h-4 w-4" /> },
                  ]}
                />
              </>
            )}

            <ColorInput
              label={kind === "text" ? t("Text color") : t("Icon color")}
              value={props.color}
              swatches={swatches}
              className="w-28"
              onChange={(hex) => setStyle({ color: hex })}
            />

            {/* `isTextLike` and not `kind === "text"`: a box that holds text
                *and* a child element reads as text here, but the advanced
                panel refuses to render its text sections for it — the button
                opened nothing at all. */}
            {kind === "text" && props.isTextLike && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => onOpenAdvanced("effects")}
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                {t("Effects")}
              </Button>
            )}
          </>
        ) : kind === "image" ? (
          <>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={onOpenImages}>
              <ImageIcon className="h-4 w-4" aria-hidden />
              {t("Replace")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => onOpenAdvanced("crop")}
            >
              <Crop className="h-4 w-4" aria-hidden />
              {t("Crop")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => onOpenAdvanced("filters")}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              {t("Filters")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => onOpenAdvanced("frame")}
            >
              <Square className="h-4 w-4" aria-hidden />
              {t("Frame")}
            </Button>
          </>
        ) : (
          <>
            <ColorInput
              label={t("Fill")}
              value={props.backgroundColor}
              swatches={swatches}
              className="w-28"
              onChange={(hex) => setStyle({ "background-color": hex })}
            />
            <NumberInput
              label={t("Corner radius")}
              value={props.borderRadius}
              min={0}
              max={999}
              suffix="px"
              className="w-24"
              onChange={(n) => setStyle({ "border-radius": `${n}px` })}
            />
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => onOpenAdvanced("border")}
            >
              <Square className="h-4 w-4" aria-hidden />
              {t("Border")}
            </Button>
          </>
        )}

        {selectionCount === 1 && props && (
          <>
            <Divider />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1 tabular-nums">
                  {props.opacity}%
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56">
                <Slider
                  label={t("Opacity")}
                  value={props.opacity}
                  min={0}
                  max={100}
                  suffix="%"
                  onChange={(v) => setStyle({ opacity: String(v / 100) })}
                />
              </PopoverContent>
            </Popover>
            {/* The advanced panel only carries "Position" for an absolutely
                positioned element — on anything in normal flow this used to
                be a button that did nothing. */}
            {props.isFloating && (
              <IconButton
                label={t("Exact position and size")}
                size="sm"
                onClick={() => onOpenAdvanced("position")}
              >
                <Move className="h-4 w-4" aria-hidden />
              </IconButton>
            )}
          </>
        )}

        <Divider />

        {/* Stacking order and the lock. They used to sit in the canvas row
            above instead, which is about the canvas, not about what you have
            selected. */}
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5">
              <Layers className="h-4 w-4" aria-hidden />
              {t("Layer")}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
            </Button>
          </MenuTrigger>
          <MenuContent align="start">
            <MenuItem onSelect={() => commands.order("front")} disabled={locked}>
              <ArrowUpToLine className="h-4 w-4" aria-hidden />
              {t("Bring to front")}
              <MenuShortcut>Ctrl ⇧ ]</MenuShortcut>
            </MenuItem>
            <MenuItem onSelect={() => commands.order("forward")} disabled={locked}>
              {t("Bring forward")}
              <MenuShortcut>Ctrl ]</MenuShortcut>
            </MenuItem>
            <MenuItem onSelect={() => commands.order("backward")} disabled={locked}>
              {t("Send backward")}
              <MenuShortcut>Ctrl [</MenuShortcut>
            </MenuItem>
            <MenuItem onSelect={() => commands.order("back")} disabled={locked}>
              <ArrowDownToLine className="h-4 w-4" aria-hidden />
              {t("Send to back")}
              <MenuShortcut>Ctrl ⇧ [</MenuShortcut>
            </MenuItem>
          </MenuContent>
        </Menu>
        <IconButton
          label={locked ? t("Unlock (Ctrl L)") : t("Lock (Ctrl L)")}
          size="sm"
          active={locked}
          onClick={commands.toggleLock}
        >
          {locked ? (
            <Lock className="h-4 w-4" aria-hidden />
          ) : (
            <Unlock className="h-4 w-4" aria-hidden />
          )}
        </IconButton>

        <Divider />
        {/* The style brush: the look of one element, painted onto another
            without touching where it is or what it says. */}
        <IconButton
          label={t("Copy style (Ctrl Alt C)")}
          size="sm"
          onClick={commands.copyStyle}
          disabled={selectionCount !== 1}
        >
          <Paintbrush className="h-4 w-4" aria-hidden />
        </IconButton>
        <IconButton
          label={t("Paste style (Ctrl Alt V)")}
          size="sm"
          onClick={commands.pasteStyle}
          disabled={!commands.hasStyleClipboard || locked}
        >
          <PaintBucket className="h-4 w-4" aria-hidden />
        </IconButton>
        {onApplyToAll && selectionCount === 1 && (
          <IconButton
            label={t("Apply this element to all pages")}
            size="sm"
            onClick={onApplyToAll}
          >
            <Files className="h-4 w-4" aria-hidden />
          </IconButton>
        )}
        <IconButton
          label={t("Duplicate (Ctrl D)")}
          size="sm"
          onClick={commands.duplicate}
          disabled={locked}
        >
          <Copy className="h-4 w-4" aria-hidden />
        </IconButton>
        <IconButton
          label={t("Delete (Del)")}
          size="sm"
          onClick={commands.remove}
          disabled={locked}
          className="hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </IconButton>
      </div>
      )}
    </div>
  );
}

function MultiControls({ commands }: { commands: CanvasCommands }) {
  const t = useT();
  return (
    <>
      <span className="px-2 text-label tabular-nums text-muted-foreground">
        {t("{n} elements", { n: commands.count })}
      </span>
      <Divider />
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5">
            <AlignCenterHorizontal className="h-4 w-4" aria-hidden />
            {t("Align")}
            <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
          </Button>
        </MenuTrigger>
        <MenuContent align="start">
          <MenuLabel>{t("Relative to the selection")}</MenuLabel>
          <MenuItem onSelect={() => commands.align("left")}>{t("Left")}</MenuItem>
          <MenuItem onSelect={() => commands.align("center-h")}>{t("Horizontal center")}</MenuItem>
          <MenuItem onSelect={() => commands.align("right")}>{t("Right")}</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => commands.align("top")}>{t("Top")}</MenuItem>
          <MenuItem onSelect={() => commands.align("center-v")}>{t("Vertical center")}</MenuItem>
          <MenuItem onSelect={() => commands.align("bottom")}>{t("Bottom")}</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => commands.distribute("x")} disabled={!commands.canDistribute}>
            {t("Distribute horizontally")}
          </MenuItem>
          <MenuItem onSelect={() => commands.distribute("y")} disabled={!commands.canDistribute}>
            {t("Distribute vertically")}
          </MenuItem>
        </MenuContent>
      </Menu>
      {commands.canGroup && (
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={commands.group}>
          <Group className="h-4 w-4" aria-hidden />
          {t("Group")}
        </Button>
      )}
      {commands.canUngroup && (
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={commands.ungroup}>
          <Ungroup className="h-4 w-4" aria-hidden />
          {t("Ungroup")}
        </Button>
      )}
    </>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}
