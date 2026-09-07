"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LogoUploadProps {
  value: string | null;
  onChange: (path: string | null) => void;
}

export function LogoUpload({ value, onChange }: LogoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (!res.ok) throw new Error();
        onChange((await res.json()).url);
      } catch {
        setError("No se pudo subir el logo. Tiene que ser PNG, JPG, JPEG o WebP de hasta 20 MB.");
      } finally {
        setUploading(false);
      }
    },
    [onChange]
  );

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-label font-medium text-foreground">Logo</span>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleUpload(file);
        }}
      />

      {value ? (
        <div className="flex items-center gap-3">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="Logo de la marca"
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" aria-hidden />
              Reemplazar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
              <X className="h-3.5 w-3.5" aria-hidden />
              Quitar
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const file = e.dataTransfer.files[0];
            if (file) handleUpload(file);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onClick={() => fileRef.current?.click()}
          className={cn(
            "oc-focus flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
            over ? "border-accent bg-accent-soft" : "border-border hover:border-muted-foreground/50"
          )}
        >
          {uploading ? (
            <>
              <span
                className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent"
                aria-hidden
              />
              <span className="text-label text-muted-foreground">Subiendo…</span>
            </>
          ) : (
            <>
              <span
                className="flex h-control-lg w-control-lg items-center justify-center rounded-full bg-muted"
                aria-hidden
              >
                <Upload className="h-4 w-4 text-muted-foreground" />
              </span>
              <span className="text-label font-medium">
                Arrastrá tu logo o tocá para elegirlo
              </span>
              <span className="text-micro text-muted-foreground">
                PNG, JPG, JPEG o WebP, hasta 20 MB
              </span>
            </>
          )}
        </button>
      )}

      {error && (
        <p role="alert" className="text-micro text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
