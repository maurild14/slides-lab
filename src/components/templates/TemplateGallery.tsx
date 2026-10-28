"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TemplateCard } from "./TemplateCard";
import type { Template } from "@/types/template";
import { useT } from "@/components/locale-provider";

export function TemplateGallery() {
  const router = useRouter();
  const t = useT();
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
        setActionError(t("Couldn't create the carousel from the template. Try again."));
        return;
      }
      const carousel = await res.json();
      router.push(`/carousel/${carousel.id}`);
    },
    [router, t]
  );

  const handleDelete = useCallback(async (template: Template) => {
    setActionError(null);
    const res = await fetch(`/api/templates/${template.id}`, { method: "DELETE" });
    if (res.ok) setTemplates((prev) => prev.filter((x) => x.id !== template.id));
    else setActionError(t("Couldn't delete “{name}”. Try again.", { name: template.name }));
  }, [t]);

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
        title={t("We couldn't load the templates")}
        hint={t("The server may not be responding. Check the terminal and try again.")}
        action={
          <Button variant="outline" onClick={retry}>
            {t("Retry")}
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
        title={pendingDelete ? t("Delete the template “{name}”?", { name: pendingDelete.name }) : ""}
        description={t("Carousels you already made with it are not touched. This can't be undone.")}
        confirmLabel={t("Delete")}
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
          title={t("You haven't saved any templates yet")}
          hint={t("Open a carousel and click “Save as template” in the editor bar to reuse its layout.")}
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
