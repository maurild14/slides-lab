"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TemplateCard } from "./TemplateCard";
import type { Template } from "@/types/template";

export function TemplateGallery() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Template | null>(null);

  // Split so the mount path does no synchronous setState: the initial state
  // already says "loading". Only the retry button needs the reset.
  const fetchAll = useCallback(() => {
    fetch("/api/templates")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => setTemplates(data.templates || []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  const retry = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    fetchAll();
  }, [fetchAll]);

  useEffect(fetchAll, [fetchAll]);

  const handleUse = useCallback(
    async (templateId: string) => {
      setActionError(null);
      const res = await fetch(`/api/templates/${templateId}/use`, { method: "POST" });
      if (!res.ok) {
        setActionError("No se pudo crear el carrusel desde la plantilla. Probá de nuevo.");
        return;
      }
      const carousel = await res.json();
      router.push(`/carousel/${carousel.id}`);
    },
    [router]
  );

  const handleDelete = useCallback(async (template: Template) => {
    setActionError(null);
    const res = await fetch(`/api/templates/${template.id}`, { method: "DELETE" });
    if (res.ok) setTemplates((prev) => prev.filter((t) => t.id !== template.id));
    else setActionError(`No se pudo eliminar «${template.name}». Probá de nuevo.`);
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-52 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <EmptyState
        tone="error"
        icon={<AlertTriangle className="h-6 w-6" />}
        title="No pudimos cargar las plantillas"
        hint="Puede que el servidor no esté respondiendo. Revisá la terminal y volvé a intentar."
        action={
          <Button variant="outline" onClick={retry}>
            Reintentar
          </Button>
        }
      />
    );
  }

  return (
    <>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete ? `¿Eliminar la plantilla «${pendingDelete.name}»?` : ""}
        description="Los carruseles que ya creaste con ella no se tocan. Esto no se puede deshacer."
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={() => pendingDelete && handleDelete(pendingDelete)}
      />

      {actionError && (
        <p
          role="alert"
          className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-body text-destructive"
        >
          {actionError}
        </p>
      )}

      {templates.length === 0 ? (
        <EmptyState
          icon={<Bookmark className="h-6 w-6" />}
          title="Todavía no guardaste ninguna plantilla"
          hint="Abrí un carrusel y guardalo como plantilla desde el panel Diseño para reutilizar su maqueta."
        />
      ) : (
        <ul className="oc-stagger grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onUse={handleUse}
              onDelete={() => setPendingDelete(template)}
            />
          ))}
        </ul>
      )}
    </>
  );
}
