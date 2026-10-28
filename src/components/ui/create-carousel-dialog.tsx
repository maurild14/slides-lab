"use client";

import { useState } from "react";
import { Layers } from "lucide-react";
import { Button } from "./button";
import { useT } from "@/components/locale-provider";
import { Input } from "./input";
import { Field } from "./field";
import { DialogShell, DialogIcon, DialogClose } from "./dialog";
import { AspectRatioSelector } from "@/components/editor/AspectRatioSelector";
import type { AspectRatio } from "@/types/carousel";

interface CreateCarouselDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, aspectRatio: AspectRatio) => void;
}

export function CreateCarouselDialog({
  open,
  onOpenChange,
  onCreate,
}: CreateCarouselDialogProps) {
  const t = useT();
  const [name, setName] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("4:5");

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed, aspectRatio);
    setName("");
    setAspectRatio("4:5");
    onOpenChange(false);
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t("New carousel")}
      icon={
        <DialogIcon>
          <Layers className="h-5 w-5" />
        </DialogIcon>
      }
      footer={
        <>
          <DialogClose asChild>
            <Button variant="outline">{t("Cancel")}</Button>
          </DialogClose>
          <Button variant="accent" onClick={handleCreate} disabled={!name.trim()}>
            {t("Create")}
          </Button>
        </>
      }
    >
      <Field label={t("Carousel name")} hint={t("You can change it later from the top bar.")}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("E.g.: 5 tips for working remotely")}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
        />
      </Field>

      {/* Not wrapped in Field: the selector is a radiogroup that names itself,
          so a second label would announce it twice. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-label font-medium">{t("Aspect ratio")}</span>
        <AspectRatioSelector
          value={aspectRatio}
          onChange={setAspectRatio}
          label={t("Aspect ratio")}
        />
      </div>
    </DialogShell>
  );
}
