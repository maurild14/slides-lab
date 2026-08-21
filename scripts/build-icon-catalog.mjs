/**
 * Freeze Lucide's icon geometry into a static catalog the editor can search
 * and insert without importing 1695 React components into the browser bundle.
 *
 * Run after upgrading lucide-react:  node scripts/build-icon-catalog.mjs
 */
import { readdir, writeFile } from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";

const ICON_DIR = path.resolve("node_modules/lucide-react/dist/esm/icons");
const OUT = path.resolve("public/icon-catalog.json");

const files = (await readdir(ICON_DIR))
  .filter((f) => f.endsWith(".js"))
  .sort();

const catalog = {};
for (const file of files) {
  const name = file.replace(/\.js$/, "");
  const mod = await import(pathToFileURL(path.join(ICON_DIR, file)).href);
  if (!mod.__iconNode) continue;
  // Drop lucide's React reconciliation keys — dead weight in a static catalog.
  catalog[name] = mod.__iconNode.map(([tag, attrs]) => [
    tag,
    Object.fromEntries(Object.entries(attrs).filter(([k]) => k !== "key")),
  ]);
}

await writeFile(OUT, JSON.stringify(catalog));
console.log(`icon-catalog: ${Object.keys(catalog).length} icons -> ${OUT}`);
