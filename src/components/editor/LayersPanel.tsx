"use client";

import { useT } from "@/components/locale-provider";
import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Lock,
  Shapes,
  Sparkle,
  Type as TypeIcon,
  Unlock,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  elementChildren,
  getSlideRoot,
  isHidden,
  isLocked,
  isGroup,
  moveLayerTo,
  setHidden,
  setLocked,
} from "@/lib/canvas-utils";
import { OC_NAME, elementKind, elementLabel, type ElementKind } from "@/lib/slide-elements";
import { IconButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<ElementKind, React.ComponentType<{ className?: string }>> = {
  text: TypeIcon,
  image: ImageIcon,
  icon: Sparkle,
  shape: Shapes,
  group: Shapes,
};

interface LayerNode {
  id: string;
  el: HTMLElement;
  depth: number;
  /** Only top-level rows are sortable — a group's members move with it. */
  sortable: boolean;
}

interface Props {
  /**
   * The slide's document, passed as a value rather than read from the iframe
   * ref: the list is derived during render, and a ref read there is both a
   * lint error and a genuine staleness trap.
   */
  doc: Document | null;
  selection: HTMLElement[];
  onSelectionChange: (els: HTMLElement[]) => void;
  onCommit: () => void;
  /** Bumped on every slide mutation — the DOM is the model, so re-read it. */
  tick: number;
  enabled: boolean;
}

export function LayersPanel({
  doc,
  selection,
  onSelectionChange,
  onCommit,
  tick,
  enabled,
}: Props) {
  const t = useT();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);

  const nodes = useMemo(() => {
    // `tick` is the whole point: the DOM is the model, so every write to the
    // slide has to make this recompute.
    void tick;
    if (!doc?.body) return [];

    const out: LayerNode[] = [];
    // dnd-kit needs stable string ids. The position in the tree is one, and it
    // costs nothing: no map to keep in sync, and no attribute written into the
    // slide's markup where the PNG export would have to walk past it.
    const walk = (parent: HTMLElement, depth: number, sortable: boolean, path: string) => {
      // Reversed: the layer list reads top of the stack first, like every
      // other design tool, while the DOM stores bottom first.
      elementChildren(parent)
        .reverse()
        .forEach((el, i) => {
          const id = `${path}-${i}`;
          out.push({ id, el, depth, sortable });
          if (isGroup(el) && expanded.has(id)) walk(el, depth + 1, false, id);
        });
    };
    walk(getSlideRoot(doc), 0, true, "l");
    return out;
  }, [doc, tick, expanded]);

  const sortableIds = nodes.filter((n) => n.sortable).map((n) => n.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = sortableIds.indexOf(String(active.id));
    const to = sortableIds.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    const el = nodes.find((n) => n.id === active.id)?.el;
    if (!el) return;
    // The list is top-first and the DOM is bottom-first, so the drop index
    // has to be mirrored before it means anything to the document.
    moveLayerTo(el, sortableIds.length - 1 - to);
    onCommit();
  };

  const toggle = (node: LayerNode, action: "lock" | "hide") => {
    if (action === "lock") {
      const next = !isLocked(node.el);
      setLocked(node.el, next);
      if (next) onSelectionChange(selection.filter((s) => s !== node.el));
    } else {
      const next = !isHidden(node.el);
      setHidden(node.el, next);
      if (next) onSelectionChange(selection.filter((s) => s !== node.el));
    }
    onCommit();
  };

  const rename = (node: LayerNode, name: string) => {
    const trimmed = name.trim();
    if (trimmed) node.el.setAttribute(OC_NAME, trimmed);
    else node.el.removeAttribute(OC_NAME);
    setRenaming(null);
    onCommit();
  };

  if (nodes.length === 0) {
    return (
      <Frame>
        <p className="px-4 py-6 text-center text-label leading-relaxed text-muted-foreground">
          {t("This slide is empty. Insert something from the rail on the left.")}
        </p>
      </Frame>
    );
  }

  return (
    <Frame>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-0.5 px-2 pb-3">
            {nodes.map((node) => (
              <LayerRow
                key={node.id}
                node={node}
                selected={selection.includes(node.el)}
                expanded={expanded.has(node.id)}
                renaming={renaming === node.id}
                enabled={enabled}
                onExpand={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (!next.delete(node.id)) next.add(node.id);
                    return next;
                  })
                }
                onSelect={(additive) =>
                  onSelectionChange(
                    additive
                      ? selection.includes(node.el)
                        ? selection.filter((s) => s !== node.el)
                        : [...selection, node.el]
                      : [node.el]
                  )
                }
                onStartRename={() => setRenaming(node.id)}
                onRename={(name) => rename(node, name)}
                onToggle={(action) => toggle(node, action)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="flex min-h-0 flex-col border-b border-border">
      <h2 className="flex h-control shrink-0 items-center px-4 text-section font-semibold">
        {t("Layers")}
      </h2>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function LayerRow({
  node,
  selected,
  expanded,
  renaming,
  enabled,
  onExpand,
  onSelect,
  onStartRename,
  onRename,
  onToggle,
}: {
  node: LayerNode;
  selected: boolean;
  expanded: boolean;
  renaming: boolean;
  enabled: boolean;
  onExpand: () => void;
  onSelect: (additive: boolean) => void;
  onStartRename: () => void;
  onRename: (name: string) => void;
  onToggle: (action: "lock" | "hide") => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: node.id, disabled: !node.sortable || !enabled });
  const t = useT();

  const kind = elementKind(node.el);
  const Icon = KIND_ICON[kind];
  const label = elementLabel(node.el, t);
  const locked = isLocked(node.el);
  const hidden = isHidden(node.el);
  const group = isGroup(node.el);

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        paddingLeft: node.depth * 16,
      }}
      className={cn("relative", isDragging && "z-10 opacity-60")}
    >
      <div
        className={cn(
          "group flex h-control items-center gap-1 rounded-md pr-1 transition-colors duration-150",
          selected ? "bg-accent-soft" : "hover:bg-muted",
          hidden && "opacity-50"
        )}
      >
        {/* A group's members ride with the group, so their handle is only a
            spacer. Spreading dnd-kit's attributes on it anyway left an
            invisible, focusable button in every nested row's tab order. */}
        {node.sortable ? (
          <span
            {...attributes}
            {...listeners}
            aria-label={t("Reorder {label}", { label })}
            className="flex h-full w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" aria-hidden />
          </span>
        ) : (
          <span aria-hidden className="w-5 shrink-0" />
        )}

        {group ? (
          <button
            type="button"
            onClick={onExpand}
            aria-label={expanded ? t("Collapse {label}", { label }) : t("Expand {label}", { label })}
            aria-expanded={expanded}
            className="oc-focus flex h-full w-4 shrink-0 cursor-pointer items-center justify-center text-muted-foreground"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden />
            )}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            selected ? "text-accent" : "text-muted-foreground"
          )}
        />

        {renaming ? (
          <input
            autoFocus
            defaultValue={label}
            aria-label={t("Name of {label}", { label })}
            onBlur={(e) => onRename(e.target.value)}
            onKeyDown={(e) => {
              // Commit directly rather than via blur(): the input unmounts on
              // commit, so there is no second trip through onBlur.
              if (e.key === "Enter") onRename(e.currentTarget.value);
              if (e.key === "Escape") onRename(label);
            }}
            className="oc-focus min-w-0 flex-1 rounded-sm border border-accent bg-surface px-1.5 py-0.5 text-label outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={(e) => onSelect(e.shiftKey || e.metaKey || e.ctrlKey)}
            onDoubleClick={onStartRename}
            title={t("{label} — double-click to rename", { label })}
            className={cn(
              "oc-focus min-w-0 flex-1 cursor-pointer truncate rounded-sm px-1 py-0.5 text-left text-label",
              selected ? "font-medium text-foreground" : "text-foreground"
            )}
          >
            {label}
          </button>
        )}

        {/* Always rendered, never hover-gated: a control you cannot find is a
            control that does not exist. Dimmed until it matters. */}
        <IconButton
          label={hidden ? t("Show {label}", { label }) : t("Hide {label}", { label })}
          size="sm"
          onClick={() => onToggle("hide")}
          className={cn(
            "shrink-0",
            !hidden && "opacity-45 group-hover:opacity-100 focus-visible:opacity-100"
          )}
        >
          {hidden ? (
            <EyeOff className="h-4 w-4" aria-hidden />
          ) : (
            <Eye className="h-4 w-4" aria-hidden />
          )}
        </IconButton>
        <IconButton
          label={locked ? t("Unlock {label}", { label }) : t("Lock {label}", { label })}
          size="sm"
          onClick={() => onToggle("lock")}
          className={cn(
            "shrink-0",
            !locked && "opacity-45 group-hover:opacity-100 focus-visible:opacity-100"
          )}
        >
          {locked ? (
            <Lock className="h-4 w-4" aria-hidden />
          ) : (
            <Unlock className="h-4 w-4" aria-hidden />
          )}
        </IconButton>
      </div>
    </li>
  );
}
