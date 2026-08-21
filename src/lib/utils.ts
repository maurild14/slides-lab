import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The type scale is registered as font sizes, not as colours.
 *
 * Without this, tailwind-merge reads `text-body` as `text-{color}` and drops
 * the colour that came before it — `cn("text-background", "text-body")` kept
 * only the size, and every `bg-foreground` button rendered near-black text on
 * a near-black fill. Any token added to the scale in globals.css belongs here
 * too.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["micro", "label", "section", "body", "title", "display"] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}
