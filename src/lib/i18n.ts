import { es } from "./i18n-es";

/**
 * UI language. English is the source text and the default; Spanish is a
 * dictionary keyed by the English string (gettext style), so a missing entry
 * falls back to readable English instead of a raw key.
 *
 * The choice lives in a cookie rather than localStorage so the server sees it
 * too: the root layout renders `<html lang>` from it without a flash, and
 * /api/chat tells the agent which language to answer in.
 */
export type Locale = "en" | "es";

export const LOCALES: { id: Locale; label: string }[] = [
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
];

export const LOCALE_COOKIE = "slides-lab-locale";

export function parseLocale(value: string | null | undefined): Locale {
  return value === "es" ? "es" : "en";
}

/** Reads the locale off a raw `Cookie` header — for route handlers. */
export function requestLocale(request: Request): Locale {
  const match = request.headers
    .get("cookie")
    ?.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`));
  return parseLocale(match?.[1]);
}

export type Vars = Record<string, string | number>;

export function translate(locale: Locale, text: string, vars?: Vars): string {
  const s = locale === "es" ? (es[text] ?? text) : text;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}
