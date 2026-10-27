import { NextResponse } from "next/server";
import { getBrand, updateBrand } from "@/lib/brand";
import type { BrandColors, BrandConfig, BrandFonts } from "@/types/brand";
import { either, isString, isStringArray, oneOf, pickFields, type Check } from "@/lib/pick-fields";

const COLORS = {
  primary: isString,
  secondary: isString,
  accent: isString,
  background: isString,
  surface: isString,
};
const FONTS = { heading: isString, body: isString };
const isCustomFonts: Check = (v) =>
  Array.isArray(v) && v.every((f) => !!f && isString(f.name) && isString(f.path));

// The panel sends the whole object back, timestamps included: unknown keys are
// dropped, `createdAt`/`updatedAt` stay server-owned.
const EDITABLE = {
  name: isString,
  colors: (v: unknown) => !!pickFields<BrandColors>(v, COLORS),
  fonts: (v: unknown) => !!pickFields<BrandFonts>(v, FONTS),
  customFonts: isCustomFonts,
  logoPath: either(isString, oneOf(null)),
  styleKeywords: isStringArray,
};

export async function GET() {
  const brand = await getBrand();
  return NextResponse.json(brand);
}

export async function PUT(request: Request) {
  try {
    const updates = pickFields<BrandConfig>(await request.json(), EDITABLE);
    if (!updates) {
      return NextResponse.json({ error: "Invalid fields" }, { status: 400 });
    }
    // Nested objects get the same whitelist, or `colors.__anything` would ride along.
    if (updates.colors) updates.colors = pickFields<BrandColors>(updates.colors, COLORS) as BrandColors;
    if (updates.fonts) updates.fonts = pickFields<BrandFonts>(updates.fonts, FONTS) as BrandFonts;
    const updated = await updateBrand(updates);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
