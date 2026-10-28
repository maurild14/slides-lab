"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Layers,
  Calendar,
  SlidersHorizontal,
  Trash2,
  Copy,
  AlertTriangle,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Button, IconButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CreateCarouselDialog } from "@/components/ui/create-carousel-dialog";
import { BrandSetup } from "@/components/brand/BrandSetup";
import { SlideRenderer } from "@/components/editor/SlideRenderer";
import { TemplateGallery } from "@/components/templates/TemplateGallery";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/components/locale-provider";
import type { AspectRatio, Carousel } from "@/types/carousel";
import type { BrandConfig } from "@/types/brand";

const TABS = [
  { id: "carousels", label: "My carousels" },
  { id: "templates", label: "Templates" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function DashboardPage() {
  const router = useRouter();
  const t = useT();
  const { locale } = useLocale();
  const [carousels, setCarousels] = useState<Carousel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showBrandSetup, setShowBrandSetup] = useState(false);
  const [brand, setBrand] = useState<BrandConfig | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("carousels");

  // Split so the mount path does no synchronous setState: the initial state
  // already says "loading". Only the retry button needs the reset.
  const fetchAll = useCallback(() => {
    Promise.all([
      fetch("/api/carousels").then((r) => {
        if (!r.ok) throw new Error("carousels");
        return r.json();
      }),
      fetch("/api/brand").then((r) => {
        if (!r.ok) throw new Error("brand");
        return r.json();
      }),
    ])
      .then(([carouselData, brandData]) => {
        setCarousels(carouselData.carousels || []);
        setBrand(brandData);
        if (!brandData.name || brandData.name.trim() === "") {
          setShowBrandSetup(true);
        }
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  const retry = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    fetchAll();
  }, [fetchAll]);

  useEffect(fetchAll, [fetchAll]);

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({ open: false, title: "", description: "", onConfirm: () => {} });

  const handleDelete = useCallback((id: string, name: string) => {
    setConfirmState({
      open: true,
      title: t("Delete “{name}”?", { name }),
      description: t("The carousel and all its slides are deleted. This can't be undone."),
      onConfirm: async () => {
        setActionError(null);
        const res = await fetch(`/api/carousels/${id}`, { method: "DELETE" });
        if (res.ok) setCarousels((prev) => prev.filter((c) => c.id !== id));
        else setActionError(t("Couldn't delete “{name}”. Try again.", { name }));
      },
    });
  }, [t]);

  const handleDuplicate = useCallback(async (id: string, name: string) => {
    setActionError(null);
    const res = await fetch(`/api/carousels/${id}/duplicate`, { method: "POST" });
    if (!res.ok) {
      setActionError(t("Couldn't duplicate “{name}”. Try again.", { name }));
      return;
    }
    const copy: Carousel = await res.json();
    setCarousels((prev) => [copy, ...prev]);
  }, [t]);

  const handleCreate = useCallback(
    async (name: string, aspectRatio: AspectRatio) => {
      setActionError(null);
      const res = await fetch("/api/carousels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, aspectRatio }),
      });
      if (!res.ok) {
        setActionError(t("Couldn't create the carousel. Try again."));
        return;
      }
      const carousel = await res.json();
      router.push(`/carousel/${carousel.id}`);
    },
    [router, t]
  );

  return (
    <div className="flex h-full flex-col">
      <TopBar onSettingsClick={() => setShowBrandSetup(true)} />

      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => setConfirmState((s) => ({ ...s, open }))}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={t("Delete")}
        variant="destructive"
        onConfirm={confirmState.onConfirm}
      />

      <CreateCarouselDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreate={handleCreate}
      />

      <BrandSetup
        open={showBrandSetup}
        onComplete={() => {
          setShowBrandSetup(false);
          fetch("/api/brand")
            .then((r) => r.json())
            .then(setBrand)
            .catch(() => {});
        }}
        initialBrand={brand || undefined}
      />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-display font-bold">Slides Lab</h1>
              <p className="mt-1 text-body text-muted-foreground">
                {t("Instagram carousels, with AI and direct editing")}
              </p>
            </div>
            <Button onClick={() => setShowCreateDialog(true)} variant="accent" size="lg">
              <Plus className="h-4 w-4" aria-hidden />
              {t("New carousel")}
            </Button>
          </div>

          <div
            role="tablist"
            aria-label={t("Sections")}
            className="mb-6 flex gap-1 border-b border-border"
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                aria-controls={`panel-${tab.id}`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                  const i = TABS.findIndex((x) => x.id === activeTab);
                  const step = e.key === "ArrowRight" ? 1 : TABS.length - 1;
                  const next = TABS[(i + step) % TABS.length];
                  setActiveTab(next.id);
                  document.getElementById(`tab-${next.id}`)?.focus();
                }}
                className={cn(
                  "oc-focus flex h-control-lg cursor-pointer items-center rounded-t-md border-b-2 px-4 text-body font-medium transition-colors",
                  activeTab === tab.id
                    ? "border-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t(tab.label)}
              </button>
            ))}
          </div>

          {actionError && (
            <p
              role="alert"
              className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-body text-destructive"
            >
              {actionError}
            </p>
          )}

          <div
            role="tabpanel"
            id={`panel-${activeTab}`}
            aria-labelledby={`tab-${activeTab}`}
          >
            {activeTab === "templates" ? (
              <TemplateGallery />
            ) : loading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-52 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : loadError ? (
              <EmptyState
                tone="error"
                icon={<AlertTriangle className="h-6 w-6" />}
                title={t("We couldn't load your carousels")}
                hint={t("The server may not be responding. Check the terminal and try again.")}
                action={
                  <Button variant="outline" onClick={retry}>
                    {t("Retry")}
                  </Button>
                }
              />
            ) : carousels.length === 0 ? (
              <EmptyState
                icon={<Layers className="h-6 w-6" />}
                title={t("No carousels yet")}
                hint={t("Create the first one and ask the AI to build the slides, or design them yourself in the editor.")}
                action={
                  <Button
                    onClick={() => setShowCreateDialog(true)}
                    variant="accent"
                    size="lg"
                  >
                    <Plus className="h-5 w-5" aria-hidden />
                    {t("Create my first carousel")}
                  </Button>
                }
              />
            ) : (
              <ul className="oc-stagger grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {carousels.map((carousel) => (
                  <li
                    key={carousel.id}
                    className="group relative rounded-xl border border-border bg-surface p-4 shadow-rest transition-[translate,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] focus-within:border-accent/50 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-raised"
                  >
                    <div className="mb-3 flex h-32 items-center justify-center overflow-hidden rounded-lg bg-muted">
                      {carousel.slides.length > 0 ? (
                        <SlideRenderer
                          html={carousel.slides[0].html}
                          aspectRatio={carousel.aspectRatio}
                          className="h-full w-full"
                        />
                      ) : (
                        <span className="flex flex-col items-center gap-1 text-micro text-muted-foreground">
                          <Layers className="h-6 w-6 opacity-40" aria-hidden />
                          {t("No slides")}
                        </span>
                      )}
                    </div>

                    {/* Stretched link: the whole card opens the carousel and the
                        action buttons still get their own focus stop. A div with
                        onClick gives neither. */}
                    <h2 className="text-body font-semibold">
                      <Link
                        href={`/carousel/${carousel.id}`}
                        className="oc-focus block truncate rounded transition-colors after:absolute after:inset-0 after:content-[''] group-hover:text-accent"
                      >
                        {carousel.name}
                      </Link>
                    </h2>

                    <div className="mt-2 flex items-center gap-2 text-label text-muted-foreground">
                      <Badge variant="secondary" className="text-micro">
                        <SlidersHorizontal className="mr-1 h-2.5 w-2.5" aria-hidden />
                        {carousel.aspectRatio}
                      </Badge>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" aria-hidden />
                        {new Date(carousel.updatedAt).toLocaleDateString(locale === "es" ? "es-AR" : "en-US")}
                      </span>
                      <span className="ml-auto">
                        {carousel.slides.length}{" "}
                        {carousel.slides.length === 1 ? "slide" : "slides"}
                      </span>
                    </div>

                    {/* Above the stretched link, and never hover-only: an action
                        that only exists on hover does not exist for the keyboard. */}
                    <div className="absolute right-3 top-3 z-10 flex gap-1">
                      <IconButton
                        label={t("Duplicate {name}", { name: carousel.name })}
                        size="sm"
                        className="border border-border bg-surface shadow-rest"
                        onClick={() => handleDuplicate(carousel.id, carousel.name)}
                      >
                        <Copy className="h-4 w-4" aria-hidden />
                      </IconButton>
                      <IconButton
                        label={t("Delete {name}", { name: carousel.name })}
                        size="sm"
                        className="border border-border bg-surface shadow-rest hover:border-destructive hover:bg-destructive hover:text-white"
                        onClick={() => handleDelete(carousel.id, carousel.name)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </IconButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
