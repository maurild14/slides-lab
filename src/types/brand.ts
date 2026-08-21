export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
}

export interface BrandFonts {
  heading: string;
  body: string;
}

export interface CustomFont {
  name: string;
  path: string;
}

export interface BrandConfig {
  name: string;
  colors: BrandColors;
  fonts: BrandFonts;
  customFonts: CustomFont[];
  logoPath: string | null;
  styleKeywords: string[];
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_BRAND: BrandConfig = {
  name: "",
  colors: {
    primary: "#1a1a2e",
    secondary: "#16213e",
    accent: "#e94560",
    background: "#ffffff",
    surface: "#f5f5f5",
  },
  fonts: {
    heading: "Inter",
    body: "Inter",
  },
  customFonts: [],
  logoPath: null,
  styleKeywords: [],
  createdAt: "",
  updatedAt: "",
};

/**
 * Fill in whatever the stored brand is missing.
 *
 * The brand wizard lets you skip fields, so colours come back as empty
 * strings — and an empty string in `background:${color}` is a declaration the
 * browser silently drops, which reads as "the shape tool inserts nothing".
 */
export function withBrandDefaults(brand: Partial<BrandConfig> | null): BrandConfig {
  const pick = <T extends object>(value: Partial<T> | undefined, fallback: T): T => {
    const out = { ...fallback };
    for (const key of Object.keys(fallback) as (keyof T)[]) {
      const v = value?.[key];
      if (typeof v === "string" && v.trim()) out[key] = v as T[keyof T];
    }
    return out;
  };

  return {
    ...DEFAULT_BRAND,
    ...brand,
    colors: pick(brand?.colors, DEFAULT_BRAND.colors),
    fonts: pick(brand?.fonts, DEFAULT_BRAND.fonts),
  };
}
