"use client";

import { useT } from "@/components/locale-provider";
import { useEffect, useMemo, useState } from "react";
import {
  iconSvgMarkup,
  lineCatalog,
  shapeCatalog,
  type DragPayload,
  type IconNode,
} from "@/lib/slide-elements";
import {
  InsertTile,
  PanelEmpty,
  PanelGroup,
  PanelShell,
  SearchInput,
} from "./panel-kit";

/**
 * The whole Lucide set, frozen into a static file by
 * `scripts/build-icon-catalog.mjs`.
 *
 * ponytail: one 370KB fetch the browser caches, not 1695 React components in
 * the bundle. Move it behind a search endpoint if the file ever gets big
 * enough to notice on a cold load.
 */
type Catalog = Record<string, IconNode>;

let catalogPromise: Promise<Catalog> | null = null;
function loadCatalog(): Promise<Catalog> {
  catalogPromise ??= fetch("/icon-catalog.json")
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return catalogPromise;
}

const ICON_LIMIT = 120;
const ICON_SIZE = 200;

interface Props {
  onClose: () => void;
  onInsert: (payload: DragPayload) => void;
  /** Brand colour new shapes and icons are born with. */
  color: string;
}

export function ElementsPanel({ onClose, onInsert, color }: Props) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<Catalog | null>(null);

  useEffect(() => {
    let alive = true;
    loadCatalog().then((c) => alive && setCatalog(c));
    return () => {
      alive = false;
    };
  }, []);

  const shapes = useMemo(() => shapeCatalog(color), [color]);
  const lines = useMemo(() => lineCatalog(color), [color]);

  const icons = useMemo(() => {
    if (!catalog) return [];
    const term = query.trim().toLowerCase().replace(/\s+/g, "-");
    const names = Object.keys(catalog);
    const hits = term ? names.filter((n) => n.includes(term)) : names;
    return hits.slice(0, ICON_LIMIT).map((name) => ({ name, node: catalog[name] }));
  }, [catalog, query]);

  const q = query.trim().toLowerCase();
  const match = (label: string) => !q || t(label).toLowerCase().includes(q);

  const visibleShapes = shapes.filter((s) => match(s.label));
  const visibleLines = lines.filter((s) => match(s.label));
  const nothing =
    visibleShapes.length === 0 && visibleLines.length === 0 && icons.length === 0;

  return (
    <PanelShell
      title={t("Elements")}
      description={t("Drag it onto the slide, or click it to insert it centered.")}
      onClose={onClose}
      toolbar={
        <SearchInput
          label={t("Search elements and icons")}
          placeholder={t("circle, arrow, heart…")}
          value={query}
          onChange={setQuery}
        />
      }
    >
      {nothing && <PanelEmpty>{t("Nothing matches “{query}”.", { query })}</PanelEmpty>}

      {visibleShapes.length > 0 && (
        <PanelGroup title={t("Shapes")}>
          <div className="grid grid-cols-3 gap-2">
            {visibleShapes.map((spec) => (
              <InsertTile key={spec.id} spec={spec} onInsert={onInsert} />
            ))}
          </div>
        </PanelGroup>
      )}

      {visibleLines.length > 0 && (
        <PanelGroup title={t("Lines and arrows")}>
          <div className="grid grid-cols-3 gap-2">
            {visibleLines.map((spec) => (
              <InsertTile key={spec.id} spec={spec} onInsert={onInsert} />
            ))}
          </div>
        </PanelGroup>
      )}

      <PanelGroup
        title={t("Icons")}
        action={
          catalog && icons.length >= ICON_LIMIT ? (
            <span className="text-micro text-muted-foreground">
              {t("first {n} — refine the search", { n: ICON_LIMIT })}
            </span>
          ) : null
        }
      >
        {!catalog ? (
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 15 }, (_, i) => (
              <div
                key={i}
                className="aspect-square animate-pulse rounded-md border border-border bg-muted"
              />
            ))}
          </div>
        ) : icons.length === 0 ? (
          <PanelEmpty>{t("No icon is called that. Try in English: “arrow”.")}</PanelEmpty>
        ) : (
          <div className="grid grid-cols-5 gap-2">
            {icons.map(({ name, node }) => (
              <InsertTile
                key={name}
                spec={{
                  id: name,
                  label: name.replace(/-/g, " "),
                  kind: "icon",
                  html: iconSvgMarkup(node, { color, size: ICON_SIZE }),
                  width: ICON_SIZE,
                  height: ICON_SIZE,
                }}
                onInsert={onInsert}
                className="p-2.5"
              >
                <IconPreview node={node} />
              </InsertTile>
            ))}
          </div>
        )}
      </PanelGroup>
    </PanelShell>
  );
}

/** Same geometry as `iconSvgMarkup`, rendered by React instead of by string. */
function IconPreview({ node }: { node: IconNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6 text-foreground group-hover:text-accent"
    >
      {node.map(([tag, attrs], i) => {
        const Tag = tag as "path";
        // The catalog stores SVG attribute names; React wants its own casing.
        const props: Record<string, string> = {};
        for (const [k, v] of Object.entries(attrs)) {
          props[k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
        }
        return <Tag key={i} {...props} />;
      })}
    </svg>
  );
}
