"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Settings, Layers } from "lucide-react";
import { IconButton } from "@/components/ui/button";

interface TopBarProps {
  title?: string;
  showBack?: boolean;
  editable?: boolean;
  onTitleChange?: (newTitle: string) => void;
  onSettingsClick?: () => void;
}

export function TopBar({
  title,
  showBack,
  editable,
  onTitleChange,
  onSettingsClick,
}: TopBarProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    setEditValue(title || "");
    setIsEditing(true);
  };

  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== title) onTitleChange?.(trimmed);
    else setEditValue(title || "");
    setIsEditing(false);
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
      {showBack && (
        <IconButton label="Volver al inicio" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </Link>
        </IconButton>
      )}
      <div className="flex min-w-0 items-center gap-2">
        <Layers className="h-5 w-5 shrink-0 text-accent" aria-hidden />
        {isEditing && editable ? (
          <input
            ref={inputRef}
            value={editValue}
            aria-label="Nombre del carrusel"
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") {
                setEditValue(title || "");
                setIsEditing(false);
              }
            }}
            className="min-w-[12rem] border-b-2 border-accent bg-transparent py-0.5 text-body font-semibold outline-none"
          />
        ) : editable ? (
          <button
            type="button"
            onClick={startEditing}
            title="Tocá para renombrar"
            className="oc-focus cursor-pointer truncate rounded px-1 text-body font-semibold transition-colors hover:text-accent"
          >
            {title || "Slides Lab"}
          </button>
        ) : (
          <span className="truncate text-body font-semibold">
            {title || "Slides Lab"}
          </span>
        )}
      </div>
      <div className="flex-1" />
      {onSettingsClick && (
        <IconButton label="Configurar la marca" onClick={onSettingsClick}>
          <Settings className="h-4 w-4" aria-hidden />
        </IconButton>
      )}
    </header>
  );
}
