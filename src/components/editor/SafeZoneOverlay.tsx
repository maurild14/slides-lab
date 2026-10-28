"use client";

import { useT } from "@/components/locale-provider";
import type { AspectRatio } from "@/types/carousel";
import { DIMENSIONS } from "@/types/carousel";

interface SafeZoneOverlayProps {
  aspectRatio: AspectRatio;
}

/**
 * Instagram's guides, drawn edge to edge over the slide.
 *
 * The caller is responsible for sizing this to the slide's on-screen box —
 * see CarouselPreview. Given the viewport instead, every percentage below
 * points at the wrong place.
 */
export function SafeZoneOverlay({ aspectRatio }: SafeZoneOverlayProps) {
  const t = useT();
  const { width, height } = DIMENSIONS[aspectRatio];
  const isPortrait = height > width;

  // Grid crop zone: Instagram shows center square on profile grid
  const gridCrop = isPortrait ? ((height - width) / 2 / height) * 100 : 0;

  // Bottom UI overlay: ~14% of height (like/save buttons area)
  const bottomUiPercent = 14;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {isPortrait && (
        <>
          <div
            className="absolute left-0 right-0 top-0 border-b border-dashed border-red-400/60 bg-red-500/10"
            style={{ height: `${gridCrop}%` }}
          >
            <Tag className="bottom-1 left-2">{t("Grid crop")}</Tag>
          </div>
          <div
            className="absolute bottom-0 left-0 right-0 border-t border-dashed border-red-400/60 bg-red-500/10"
            style={{ height: `${gridCrop}%` }}
          >
            <Tag className="left-2 top-1">{t("Grid crop")}</Tag>
          </div>
        </>
      )}

      <div
        className="absolute bottom-0 left-0 right-0 border-t border-dashed border-blue-400/60 bg-blue-500/10"
        style={{ height: `${bottomUiPercent}%` }}
      >
        <Tag className="right-2 top-1">{t("Instagram buttons")}</Tag>
      </div>

      <div
        className="absolute rounded-sm border border-dashed border-green-500/60"
        style={{
          left: "10%",
          right: "10%",
          top: "10%",
          bottom: `${Math.max(10, bottomUiPercent + 2)}%`,
        }}
      >
        <Tag className="left-1/2 top-1 -translate-x-1/2">{t("Safe zone")}</Tag>
      </div>
    </div>
  );
}

/**
 * The labels sit on top of whatever the slide happens to be, so they carry
 * their own background. They used to be 8px — below the app's 12px floor, and
 * unreadable against a photo.
 */
function Tag({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`absolute ${className} whitespace-nowrap rounded-sm bg-black/75 px-1.5 py-0.5 text-micro font-medium leading-none text-white`}
    >
      {children}
    </span>
  );
}
