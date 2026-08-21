"use client";

import { useState } from "react";
import { Layers } from "lucide-react";
import { Button } from "./button";
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
      title="New Carousel"
      icon={
        <DialogIcon>
          <Layers className="h-5 w-5" />
        </DialogIcon>
      }
      footer={
        <>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button variant="accent" onClick={handleCreate} disabled={!name.trim()}>
            Create
          </Button>
        </>
      }
    >
      <Field label="Carousel Name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., 5 Tips for Remote Work"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
        />
      </Field>

      {/* Not wrapped in Field: the selector is a radiogroup that names itself,
          so a second label would announce it twice. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-label font-medium">Aspect Ratio</span>
        <AspectRatioSelector
          value={aspectRatio}
          onChange={setAspectRatio}
          label="Aspect Ratio"
        />
      </div>
    </DialogShell>
  );
}
