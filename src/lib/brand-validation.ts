import type { BrandConfig } from "@/types/brand";

export interface BrandValidationError {
  field: string;
  error: string;
}

const isHex = (value: string) => /^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(value);
// Same family-name boundary used by the font renderer and its disk cache.
const isFont = (value: string) => /^[A-Za-z0-9 ]{1,64}$/.test(value) && value.trim().length > 0;

/** Validate editable values after the API's field/type whitelist. Also used by the wizard. */
export function brandValidationError(brand: {
  colors?: Partial<BrandConfig["colors"]>;
  fonts?: Partial<BrandConfig["fonts"]>;
  customFonts?: BrandConfig["customFonts"];
}): BrandValidationError | null {
  for (const [key, value] of Object.entries(brand.colors ?? {})) {
    if (!isHex(value)) return { field: `colors.${key}`, error: "Use a hex color (#rgb or #rrggbb)." };
  }
  for (const [key, value] of Object.entries(brand.fonts ?? {})) {
    if (!isFont(value)) return { field: `fonts.${key}`, error: "Use a font name with 1–64 letters, numbers or spaces." };
  }
  for (const font of brand.customFonts ?? []) {
    if (!isFont(font.name) || !/^\/uploads\/fonts\/[\w-]+\.(woff2|ttf)$/.test(font.path)) {
      return { field: "customFonts", error: "Custom fonts need a valid family name and an uploaded WOFF2 or TTF file." };
    }
  }
  return null;
}
