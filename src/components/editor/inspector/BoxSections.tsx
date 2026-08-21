"use client";

import { useState } from "react";
import { Link2, Link2Off } from "lucide-react";
import { SHADOW_PRESETS } from "@/lib/element-style";
import { setRotation } from "@/lib/canvas-utils";
import { cn } from "@/lib/utils";
import {
  ColorField,
  NumberField,
  Row,
  Section,
  SelectField,
  focusOn,
  type SectionFocus,
} from "./InspectorFields";
import type { ElementProps, ElementStyleApi } from "./use-element-style";

interface Props {
  props: ElementProps;
  api: ElementStyleApi;
  focus: SectionFocus;
}

export function BoxSections({ props: p, api, focus }: Props) {
  const { mutate, setStyle } = api;
  const [linked, setLinked] = useState(true);

  return (
    <>
      <Section title="Relleno" focused={focusOn(focus, "fill")}>
        <Row label="Fondo">
          <ColorField
            value={p.backgroundColor}
            onChange={(hex) => setStyle({ "background-color": hex })}
          />
        </Row>
        <Row label="Radio">
          <NumberField
            value={p.borderRadius}
            min={0}
            max={9999}
            suffix="px"
            onChange={(n) => setStyle({ "border-radius": `${n}px` })}
          />
        </Row>
      </Section>

      <Section title="Borde y sombra" defaultOpen={false} focused={focusOn(focus, "border")}>
        <Row label="Grosor">
          <NumberField
            value={p.borderWidth}
            min={0}
            max={200}
            suffix="px"
            onChange={(n) =>
              setStyle(
                n === 0
                  ? { border: "" }
                  : { "border-width": `${n}px`, "border-style": "solid" }
              )
            }
          />
        </Row>
        <Row label="Color">
          <ColorField
            value={p.borderColor}
            onChange={(hex) => setStyle({ "border-color": hex })}
          />
        </Row>
        <Row label="Sombra">
          <SelectField
            value={p.shadow}
            onChange={(id) => {
              const preset = SHADOW_PRESETS.find((s) => s.id === id);
              setStyle({ "box-shadow": preset?.value ?? "" });
            }}
            options={[
              ...SHADOW_PRESETS.map((s) => ({ label: s.label, value: s.id })),
              // Only reachable when the slide already carried a shadow we did
              // not write; selecting anything else replaces it.
              ...(p.shadow === "custom"
                ? [{ label: "Personalizada", value: "custom" }]
                : []),
            ]}
          />
        </Row>
      </Section>

      <Section title="Espaciado" defaultOpen={false} focused={focusOn(focus, "spacing")}>
        <Row label="Arriba">
          <NumberField
            value={p.paddingTop}
            suffix="px"
            onChange={(n) => setStyle({ "padding-top": `${n}px` })}
          />
        </Row>
        <Row label="Derecha">
          <NumberField
            value={p.paddingRight}
            suffix="px"
            onChange={(n) => setStyle({ "padding-right": `${n}px` })}
          />
        </Row>
        <Row label="Abajo">
          <NumberField
            value={p.paddingBottom}
            suffix="px"
            onChange={(n) => setStyle({ "padding-bottom": `${n}px` })}
          />
        </Row>
        <Row label="Izquierda">
          <NumberField
            value={p.paddingLeft}
            suffix="px"
            onChange={(n) => setStyle({ "padding-left": `${n}px` })}
          />
        </Row>
      </Section>

      {p.isFloating && (
        <Section title="Posición" defaultOpen={false} focused={focusOn(focus, "position")}>
          <Row label="X / Y">
            <div className="grid grid-cols-2 gap-1.5">
              <NumberField
                value={p.left}
                suffix="px"
                onChange={(n) => setStyle({ left: `${n}px` })}
              />
              <NumberField
                value={p.top}
                suffix="px"
                onChange={(n) => setStyle({ top: `${n}px` })}
              />
            </div>
          </Row>
          <Row label="An / Al">
            <div className="flex items-center gap-1.5">
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
                <NumberField
                  value={p.width}
                  min={8}
                  suffix="px"
                  onChange={(n) =>
                    setStyle(
                      linked && p.width > 0
                        ? {
                            width: `${n}px`,
                            height: `${Math.round((p.height / p.width) * n)}px`,
                          }
                        : { width: `${n}px` }
                    )
                  }
                />
                <NumberField
                  value={p.height}
                  min={8}
                  suffix="px"
                  onChange={(n) =>
                    setStyle(
                      linked && p.height > 0
                        ? {
                            height: `${n}px`,
                            width: `${Math.round((p.width / p.height) * n)}px`,
                          }
                        : { height: `${n}px` }
                    )
                  }
                />
              </div>
              <button
                type="button"
                onClick={() => setLinked((v) => !v)}
                aria-pressed={linked}
                aria-label={linked ? "Soltar la proporción" : "Mantener la proporción"}
                title={linked ? "Proporción bloqueada" : "Proporción libre"}
                className={cn(
                  "oc-press oc-focus oc-hit flex h-control-sm w-control-sm shrink-0 cursor-pointer items-center justify-center rounded-md border",
                  linked
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border bg-surface text-muted-foreground"
                )}
              >
                {linked ? (
                  <Link2 className="h-4 w-4" aria-hidden />
                ) : (
                  <Link2Off className="h-4 w-4" aria-hidden />
                )}
              </button>
            </div>
          </Row>
          <Row label="Ángulo">
            <NumberField
              value={Math.round(p.angle)}
              min={-360}
              max={360}
              suffix="°"
              onChange={(n) => mutate((el) => setRotation(el, n))}
            />
          </Row>
          <Row label="Opacidad">
            <NumberField
              value={p.opacity}
              min={0}
              max={100}
              step={5}
              suffix="%"
              onChange={(n) => setStyle({ opacity: String(n / 100) })}
            />
          </Row>
          <Row label="Capa" hint="Orden de apilamiento (z-index)">
            <NumberField
              value={p.zIndex}
              onChange={(n) => setStyle({ "z-index": String(n) })}
            />
          </Row>
        </Section>
      )}
    </>
  );
}
