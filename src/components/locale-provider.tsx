"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, translate, type Locale, type Vars } from "@/lib/i18n";

const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (next: Locale) => void;
}>({ locale: "en", setLocale: () => {} });

export function LocaleProvider({
  initial,
  children,
}: {
  initial: Locale;
  children: React.ReactNode;
}) {
  const [locale, setState] = useState(initial);
  const router = useRouter();
  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = next;
      setState(next);
      router.refresh(); // re-renders the server-side <title>
    },
    [router]
  );
  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

/** `t("Delete “{name}”?", { name })` — English in, current language out. */
export function useT() {
  const { locale } = useContext(LocaleContext);
  return useCallback(
    (text: string, vars?: Vars) => translate(locale, text, vars),
    [locale]
  );
}
