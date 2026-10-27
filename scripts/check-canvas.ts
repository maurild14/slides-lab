// Self-check for the canvas geometry and history math. Run: npm run check:canvas
// No framework on purpose — plain asserts, plain node.
import assert from "node:assert/strict";
import {
  FILTER_PRESETS,
  TEXT_EFFECTS,
  TEXT_EFFECT_PROPS,
  baseFilters,
  buildFilters,
  hasFlip,
  parseFilters,
  presetFilters,
  readTextEffect,
  STYLE_COPY_PROPS,
  styleSnapshotPatch,
  toggleFlipTransform,
  withAlpha,
} from "../src/lib/element-style.ts";
import { reflowTransform, scaleStyleLengths } from "../src/lib/slide-reflow.ts";
import { findIssues, type MeasuredBox } from "../src/lib/slide-audit-rules.ts";
import { ENGINES, statusForSlowItem } from "../src/lib/agents.ts";
import { findUploadRefs, resolveUploadPath } from "../src/lib/upload-paths.ts";
import {
  alignOffset,
  boxFromPoints,
  boxesIntersect,
  clamp,
  clampZoom,
  computeSnap,
  distributeOffsets,
  resizeBox,
  rotateVec,
  scaleBoxWithin,
  snapAngle,
  unionBox,
  zoomPanAt,
  MAX_ZOOM,
  SAFE_MARGIN,
  SNAP_THRESHOLD,
  type Box,
} from "../src/lib/canvas-utils.ts";
import {
  elementKind,
  elementLabel,
  iconSvgMarkup,
  lineCatalog,
  shapeCatalog,
  textCatalog,
} from "../src/lib/slide-elements.ts";
import {
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redo,
  undo,
  MAX_HISTORY,
} from "../src/lib/slide-history.ts";

const W = 1080;
const H = 1350;
const box = (left: number, top: number, width = 200, height = 100): Box => ({
  left,
  top,
  width,
  height,
});
const near = (a: number, b: number, msg: string, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `${msg} (got ${a}, want ${b})`);

/* ----------------------------------------------------------- snapping */

// Centre latch: a box whose centre is a few px off the slide centre snaps to it.
{
  const b = box(W / 2 - 100 + 5, 400);
  const r = computeSnap(b, [], W, H);
  assert.equal(r.left, W / 2 - b.width / 2, "centre-x should latch");
  assert.ok(
    r.guides.some((g) => g.axis === "x" && g.at === W / 2),
    "centre-x guide should be reported"
  );
}

// Nothing within range: position is untouched and no guides are drawn.
{
  const b = box(300, 500);
  const r = computeSnap(b, [], W, H);
  assert.equal(r.left, 300);
  assert.equal(r.top, 500);
  assert.deepEqual(r.guides, []);
}

// Just outside the threshold must NOT snap — the off-by-one that makes
// dragging feel sticky.
{
  const off = SNAP_THRESHOLD + 1;
  const b = box(SAFE_MARGIN + off, 500);
  const r = computeSnap(b, [], W, H);
  assert.equal(r.left, SAFE_MARGIN + off, "beyond threshold must not snap");
}

// Safe margin: left edge near the 80px margin latches onto it.
{
  const b = box(SAFE_MARGIN - 3, 500);
  const r = computeSnap(b, [], W, H);
  assert.equal(r.left, SAFE_MARGIN, "left edge should latch to safe margin");
}

// Sibling alignment: left edges line up with a neighbour.
{
  const neighbour = box(410, 200);
  const b = box(414, 900);
  const r = computeSnap(b, [neighbour], W, H);
  assert.equal(r.left, 410, "should align to sibling left edge");
}

// The closest candidate wins when several are in range.
{
  const nearest = box(W / 2 - 100 + 2, 600); // 2px from centre
  const r = computeSnap(nearest, [box(W / 2 - 100 + 7, 100)], W, H);
  assert.equal(r.left, W / 2 - nearest.width / 2, "nearest target should win");
}

// Both axes can snap in the same move.
{
  const b = box(W / 2 - 100 + 3, H / 2 - 50 + 3);
  const r = computeSnap(b, [], W, H);
  assert.equal(r.left, W / 2 - b.width / 2);
  assert.equal(r.top, H / 2 - b.height / 2);
  assert.equal(r.guides.length, 2, "one guide per snapped axis");
}

assert.equal(clamp(5, 0, 10), 5);
assert.equal(clamp(-5, 0, 10), 0);
assert.equal(clamp(50, 0, 10), 10);

/* ----------------------------------------------------------- rotation */

{
  const r = rotateVec(10, 0, 90);
  near(r.x, 0, "rotate 90 sends +x to +y");
  near(r.y, 10, "rotate 90 sends +x to +y");
}
{
  const r = rotateVec(3, 7, 0);
  assert.deepEqual(r, { x: 3, y: 7 }, "rotating by 0 is the identity");
}
// Rotating there and back must return the original vector — the property the
// resize projection depends on.
{
  const r = rotateVec(...(Object.values(rotateVec(13, -5, 37)) as [number, number]), -37);
  near(r.x, 13, "round trip keeps x");
  near(r.y, -5, "round trip keeps y");
}

assert.equal(snapAngle(7), 0, "7 degrees snaps down to 0");
assert.equal(snapAngle(8), 15, "8 degrees snaps up to 15");
assert.equal(snapAngle(-10), 345, "negative angles normalise into [0,360)");
assert.equal(snapAngle(360), 0, "360 normalises to 0");

/* ------------------------------------------------------------- resize */

// Unrotated: dragging the SE handle grows width and height, anchor NW stays.
{
  const start = box(100, 100, 200, 100);
  const r = resizeBox({ start, handle: "se", dx: 10, dy: 5, angle: 0, keepRatio: false });
  assert.deepEqual(r, { left: 100, top: 100, width: 210, height: 105 });
}

// Unrotated: dragging NW moves the origin and shrinks, anchor SE stays.
{
  const start = box(100, 100, 200, 100);
  const r = resizeBox({ start, handle: "nw", dx: 10, dy: 10, angle: 0, keepRatio: false });
  assert.deepEqual(r, { left: 110, top: 110, width: 190, height: 90 });
  assert.equal(r.left + r.width, 300, "SE corner must not move");
  assert.equal(r.top + r.height, 200, "SE corner must not move");
}

// Rotated 90 degrees: the element's east now points down the screen, so a
// downward drag on the E handle must grow width, not height.
{
  const start = box(100, 100, 200, 100);
  const r = resizeBox({ start, handle: "e", dx: 0, dy: 10, angle: 90, keepRatio: false });
  near(r.width, 210, "east grows along the element's own axis");
  near(r.height, 100, "the perpendicular axis is untouched");

  // The anchor (west edge midpoint, in slide space) must be exactly where it
  // was before the resize.
  const anchorBefore = {
    x: start.left + start.width / 2 + rotateVec(-start.width / 2, 0, 90).x,
    y: start.top + start.height / 2 + rotateVec(-start.width / 2, 0, 90).y,
  };
  const anchorAfter = {
    x: r.left + r.width / 2 + rotateVec(-r.width / 2, 0, 90).x,
    y: r.top + r.height / 2 + rotateVec(-r.width / 2, 0, 90).y,
  };
  near(anchorAfter.x, anchorBefore.x, "rotated anchor must not drift on x");
  near(anchorAfter.y, anchorBefore.y, "rotated anchor must not drift on y");
}

// Rotated 45 degrees: a drag purely along the element's own east axis.
{
  const start = box(200, 200, 100, 100);
  const along = rotateVec(20, 0, 45); // 20px in element space, expressed on screen
  const r = resizeBox({
    start,
    handle: "e",
    dx: along.x,
    dy: along.y,
    angle: 45,
    keepRatio: false,
  });
  near(r.width, 120, "a drag along the local axis grows by its full length");
  near(r.height, 100, "and leaves the other axis alone");
}

// Aspect ratio lock keeps the proportion of the starting box.
{
  const start = box(0, 0, 200, 100);
  const r = resizeBox({ start, handle: "se", dx: 100, dy: 0, angle: 0, keepRatio: true });
  near(r.width / r.height, 2, "corner resize with ratio lock keeps 2:1");
}

// The minimum size is a floor, not a suggestion.
{
  const start = box(0, 0, 40, 40);
  const r = resizeBox({
    start,
    handle: "se",
    dx: -999,
    dy: -999,
    angle: 0,
    keepRatio: false,
    minSize: 16,
  });
  assert.equal(r.width, 16);
  assert.equal(r.height, 16);
}

/* -------------------------------------------------- multi-selection box */

{
  const u = unionBox([box(100, 100, 50, 50), box(300, 80, 100, 40)]);
  assert.deepEqual(u, { left: 100, top: 80, width: 300, height: 70 });
}
assert.deepEqual(
  unionBox([]),
  { left: 0, top: 0, width: 0, height: 0 },
  "an empty selection has an empty frame"
);
{
  const single = box(12, 34, 56, 78);
  assert.deepEqual(unionBox([single]), single, "one box is its own frame");
}

// Scaling the frame scales its members proportionally, and members on the
// frame's edges stay on the corresponding edges.
{
  const frame = { left: 100, top: 100, width: 200, height: 100 };
  const doubled = { left: 100, top: 100, width: 400, height: 200 };
  const member = box(200, 150, 100, 50);
  const scaled = scaleBoxWithin(member, frame, doubled);
  assert.deepEqual(scaled, { left: 300, top: 200, width: 200, height: 100 });
  assert.equal(
    scaled.left + scaled.width,
    doubled.left + doubled.width,
    "a member flush with the frame edge stays flush"
  );
}

// A degenerate frame must not produce NaN.
{
  const flat = { left: 0, top: 0, width: 0, height: 10 };
  const r = scaleBoxWithin(box(0, 0, 0, 5), flat, { ...flat, width: 0 });
  assert.ok(Number.isFinite(r.left) && Number.isFinite(r.width), "no NaN on a zero-width frame");
}

/* ------------------------------------------------------------ marquee */

assert.ok(boxesIntersect(box(0, 0, 100, 100), box(50, 50, 100, 100)), "overlap hits");
assert.ok(!boxesIntersect(box(0, 0, 10, 10), box(20, 20, 10, 10)), "gap misses");
assert.ok(
  !boxesIntersect(box(0, 0, 10, 10), box(10, 0, 10, 10)),
  "merely touching edges is not a hit"
);
{
  const b = boxFromPoints({ x: 300, y: 400 }, { x: 100, y: 200 });
  assert.deepEqual(b, { left: 100, top: 200, width: 200, height: 200 });
}

/* ------------------------------------------------- align and distribute */

{
  const bounds = { left: 0, top: 0, width: 1000, height: 500 };
  const b = box(300, 100, 200, 100);
  assert.deepEqual(alignOffset(b, bounds, "left"), { dx: -300, dy: 0 });
  assert.deepEqual(alignOffset(b, bounds, "right"), { dx: 500, dy: 0 });
  assert.deepEqual(alignOffset(b, bounds, "center-h"), { dx: 100, dy: 0 });
  assert.deepEqual(alignOffset(b, bounds, "top"), { dx: 0, dy: -100 });
  assert.deepEqual(alignOffset(b, bounds, "bottom"), { dx: 0, dy: 300 });
  assert.deepEqual(alignOffset(b, bounds, "center-v"), { dx: 0, dy: 100 });
}

// Distribute: outer boxes stay put and the gaps between all three are equal.
{
  const boxes = [box(0, 0, 100, 10), box(120, 0, 100, 10), box(400, 0, 100, 10)];
  const offsets = distributeOffsets(boxes, "x");
  assert.equal(offsets[0], 0, "the first box must not move");
  assert.equal(offsets[2], 0, "the last box must not move");
  const placed = boxes.map((b, i) => b.left + offsets[i]);
  const gapA = placed[1] - (placed[0] + boxes[0].width);
  const gapB = placed[2] - (placed[1] + boxes[1].width);
  near(gapA, gapB, "gaps must come out equal");
}

// Distribution is order-independent: the same set given out of order lands in
// the same places.
{
  const boxes = [box(400, 0, 100, 10), box(0, 0, 100, 10), box(120, 0, 100, 10)];
  const offsets = distributeOffsets(boxes, "x");
  const placed = boxes
    .map((b, i) => b.left + offsets[i])
    .sort((a, b) => a - b);
  near(placed[1] - placed[0], placed[2] - placed[1], "equal spacing regardless of input order");
}

assert.deepEqual(
  distributeOffsets([box(0, 0), box(500, 0)], "x"),
  [0, 0],
  "fewer than three boxes have nothing to distribute"
);

/* --------------------------------------------------------- zoom and pan */

// Zooming with the cursor over a point keeps that point under the cursor.
{
  const pan = { x: 0, y: 0 };
  const point = { x: 800, y: 200 };
  const from = 0.5;
  const to = 1.0;
  const next = zoomPanAt(pan, point, W, H, from, to);

  // Client x of a slide point, per the layout the renderer produces.
  const clientX = (p: { x: number }, k: number, panX: number) =>
    (W * k) / -2 + panX + p.x * k;
  near(
    clientX(point, to, next.x),
    clientX(point, from, pan.x),
    "the point under the cursor must not move on x"
  );

  const clientY = (p: { y: number }, k: number, panY: number) =>
    (H * k) / -2 + panY + p.y * k;
  near(
    clientY(point, to, next.y),
    clientY(point, from, pan.y),
    "the point under the cursor must not move on y"
  );
}

// Zooming about the exact centre never pans.
{
  const next = zoomPanAt({ x: 5, y: 7 }, { x: W / 2, y: H / 2 }, W, H, 0.5, 2);
  assert.deepEqual(next, { x: 5, y: 7 }, "centre zoom leaves the pan alone");
}

assert.equal(clampZoom(10, 0.4), MAX_ZOOM, "zoom is capped at the maximum");
assert.equal(clampZoom(0.01, 0.4), 0.25, "zoom floors at 25% when fit is above it");
assert.equal(
  clampZoom(0.12, 0.12),
  0.12,
  "a fit scale below 25% must stay reachable"
);

/* ------------------------------------------------------------- history */

{
  let h = createHistory("<p>a</p>");
  assert.ok(!canUndo(h), "a fresh history has nothing to undo");
  assert.ok(!canRedo(h), "a fresh history has nothing to redo");

  h = pushHistory(h, "<p>b</p>");
  h = pushHistory(h, "<p>c</p>");
  assert.equal(h.stack.length, 3);
  assert.ok(canUndo(h));

  const back = undo(h)!;
  assert.equal(back.snapshot, "<p>b</p>", "undo returns the previous state");
  h = back.history;
  assert.ok(canRedo(h));

  const forward = redo(h)!;
  assert.equal(forward.snapshot, "<p>c</p>", "redo returns the state we left");
  h = forward.history;
  assert.ok(!canRedo(h), "redo exhausted at the tip");
}

// A new action after undoing discards the redo tail — the timeline stays linear.
{
  let h = createHistory("a");
  h = pushHistory(h, "b");
  h = pushHistory(h, "c");
  h = undo(h)!.history; // now at "b"
  h = pushHistory(h, "d");
  assert.deepEqual(h.stack, ["a", "b", "d"], "the redo tail is dropped");
  assert.ok(!canRedo(h));
  assert.equal(h.cursor, 2, "the cursor sits on the new tip");
}

// Recording the same snapshot twice is not a step: an aborted gesture that
// changed nothing must not cost the user an undo press.
{
  let h = createHistory("a");
  h = pushHistory(h, "a");
  assert.equal(h.stack.length, 1, "an identical snapshot is not a new step");
}

// The cap drops the oldest snapshot and keeps the cursor on the tip.
{
  let h = createHistory("0");
  for (let i = 1; i < MAX_HISTORY + 10; i++) h = pushHistory(h, String(i));
  assert.equal(h.stack.length, MAX_HISTORY, "the stack is capped");
  assert.equal(h.cursor, MAX_HISTORY - 1, "the cursor stays at the tip");
  assert.equal(h.stack[h.stack.length - 1], String(MAX_HISTORY + 9));
}

// Undoing all the way and redoing all the way is a round trip.
{
  let h = createHistory("s0");
  for (let i = 1; i <= 20; i++) h = pushHistory(h, `s${i}`);
  while (canUndo(h)) h = undo(h)!.history;
  assert.equal(h.stack[h.cursor], "s0", "undo walks back to the origin");
  while (canRedo(h)) h = redo(h)!.history;
  assert.equal(h.stack[h.cursor], "s20", "redo walks back to the tip");
}

assert.equal(undo(createHistory("only")), null, "undo past the origin returns null");
assert.equal(redo(createHistory("only")), null, "redo past the tip returns null");

/* ===================================================================== */
/*  Slide element catalogs                                                */
/* ===================================================================== */

// Every catalog entry has to be exactly one top-level element: `insertSnippet`
// takes the first child and drops the rest, so a two-root snippet loses half
// of itself silently.
{
  const all = [
    ...shapeCatalog("#123456"),
    ...lineCatalog("#123456"),
    ...textCatalog({
      headingFont: "Inter",
      bodyFont: "Inter",
      color: "#111111",
      accent: "#d62f4c",
    }),
  ];
  assert.ok(all.length >= 20, "the catalogs are not empty");

  const ids = new Set<string>();
  for (const spec of all) {
    assert.ok(!ids.has(spec.id), `duplicate spec id: ${spec.id}`);
    ids.add(spec.id);

    const roots = spec.html.match(/<(?!\/)[a-z][a-z0-9]*/gi) ?? [];
    assert.ok(roots.length >= 1, `${spec.id} has markup`);
    assert.ok(spec.html.trimStart().startsWith("<"), `${spec.id} starts with a tag`);
    assert.ok(spec.width > 0 && spec.height > 0, `${spec.id} has a natural size`);
    assert.ok(!/<script/i.test(spec.html), `${spec.id} carries no script`);
  }

  // The colour actually reaches the markup, or the brand does nothing.
  assert.ok(
    shapeCatalog("#abcdef").every((s) => s.html.includes("#abcdef")),
    "shapes wear the colour they were built with"
  );
}

// Icon markup: attributes survive, and a hostile colour cannot break out of
// the style attribute it is written into.
{
  const svg = iconSvgMarkup(
    [["path", { d: "M12 6v16" }], ["circle", { cx: "12", cy: "4", r: "2" }]],
    { color: "#ff0000", size: 200 }
  );
  assert.ok(svg.startsWith("<svg "), "icon markup is one svg root");
  assert.ok(svg.includes('d="M12 6v16"'), "path data survives");
  assert.ok(svg.includes('cx="12"'), "every child is serialized");
  assert.ok(svg.includes('width="200"'), "the requested size is written");

  const hostile = iconSvgMarkup([["path", { d: 'a"b<c' }]], { color: '"><script>' });
  assert.ok(!hostile.includes("<script"), "a quote in an attribute cannot break out");
  assert.ok(hostile.includes("&quot;"), "quotes are escaped");
}

/* ===================================================================== */
/*  Layer naming                                                          */
/* ===================================================================== */

// Stand-in for a DOM node: the describe helpers only read these three things
// on purpose, so they stay runnable without a browser.
const fake = (
  tagName: string,
  textContent: string | null,
  attrs: Record<string, string> = {}
) => ({
  tagName,
  textContent,
  getAttribute: (n: string) => (n in attrs ? attrs[n] : null),
});

{
  assert.equal(
    elementLabel(fake("DIV", "Hola mundo")),
    "Hola mundo",
    "text becomes the name"
  );
  assert.equal(elementLabel(fake("DIV", "   ")), "Forma", "blank text is a shape");
  assert.equal(elementLabel(fake("IMG", "")), "Imagen", "an image without alt");
  assert.equal(
    elementLabel(fake("IMG", "", { alt: "Logo" })),
    "Logo",
    "alt names the image"
  );
  assert.equal(elementLabel(fake("svg", "")), "Icono", "an svg is an icon");
  assert.equal(
    elementLabel(fake("DIV", "x", { "data-oc-name": "Mi capa" })),
    "Mi capa",
    "a stored name wins over everything"
  );
  assert.equal(
    elementLabel(fake("DIV", "", { "data-oc-group": "" })),
    "Grupo",
    "a group is named as one"
  );

  const long = "a".repeat(80);
  const label = elementLabel(fake("P", long));
  assert.ok(label.length <= 37, "a long text is truncated");
  assert.ok(label.endsWith("…"), "and says so");

  assert.equal(
    elementLabel(fake("P", "  dos   espacios  ")),
    "dos espacios",
    "whitespace is collapsed"
  );

  assert.equal(elementKind(fake("H1", "Título")), "text");
  assert.equal(elementKind(fake("IMG", "")), "image");
  assert.equal(elementKind(fake("svg", "")), "icon");
  assert.equal(elementKind(fake("DIV", "")), "shape");
  assert.equal(
    elementKind(fake("DIV", "con texto", { "data-oc-group": "" })),
    "group",
    "a group is a group even when it contains text"
  );
}

/* ------------------------------------------------- effects, filters, flip */
{
  // Round trip: what we build has to parse back to the same numbers.
  const values = { ...baseFilters(), saturate: 150, blur: 6, grayscale: 0 };
  const css = buildFilters(values);
  assert.equal(css, "saturate(150%) grayscale(0%) blur(6px)".replace(" grayscale(0%)", ""));
  const back = parseFilters(css);
  assert.equal(back.saturate, 150, "saturate survives the round trip");
  assert.equal(back.blur, 6, "blur keeps its pixels");
  assert.equal(back.contrast, 100, "an untouched filter reads as its base");

  assert.equal(buildFilters(baseFilters()), "", "an untouched image gets no filter at all");
  assert.equal(parseFilters("none").brightness, 100, "none is the identity");
  assert.equal(parseFilters(null).sepia, 0, "a missing filter is the identity");
  // Chrome echoes the 0–1 form back for percentage filters.
  assert.equal(parseFilters("saturate(1.5)").saturate, 150, "the 0-1 form is normalised");
  assert.equal(
    parseFilters("drop-shadow(0 0 4px red) contrast(120%)").contrast,
    120,
    "an unknown filter function is skipped, not fatal"
  );

  for (const preset of FILTER_PRESETS) {
    const built = buildFilters(presetFilters(preset.id));
    assert.ok(
      preset.id === "none" ? built === "" : built.length > 0,
      `preset ${preset.id} produces CSS`
    );
  }

  // Every effect writes only properties the switcher knows how to clear.
  for (const effect of TEXT_EFFECTS) {
    for (const prop of Object.keys(effect.css("#ff0000"))) {
      assert.ok(
        (TEXT_EFFECT_PROPS as readonly string[]).includes(prop),
        `${effect.id} writes ${prop}, which nothing would ever clear`
      );
    }
  }
  assert.deepEqual(TEXT_EFFECTS.find((e) => e.id === "none")!.css("#000"), {});
  assert.equal(withAlpha("#ff8000", 0.5), "rgb(255 128 0 / 0.5)");
  assert.equal(withAlpha("currentColor", 0.5), "currentColor", "non-hex passes through");

  // The effect the element wears has to read back as the one we applied.
  for (const effect of TEXT_EFFECTS) {
    const css = effect.css("#123456");
    const read = readTextEffect({
      textShadow: css["text-shadow"],
      webkitTextStroke: css["-webkit-text-stroke"],
    });
    assert.equal(read, effect.id, `${effect.id} reads back as itself`);
  }

  // Flipping twice is the identity, and never disturbs the rotation.
  assert.equal(toggleFlipTransform("", "x"), "scaleX(-1)");
  assert.equal(toggleFlipTransform("scaleX(-1)", "x"), "");
  const rotated = "rotate(30deg)";
  const flipped = toggleFlipTransform(rotated, "y");
  assert.ok(hasFlip(flipped, "y") && /rotate\(30deg\)/.test(flipped));
  assert.equal(toggleFlipTransform(flipped, "y"), rotated, "unflipping restores the rotation");
  assert.ok(!hasFlip("scale(2)", "x"), "a plain scale is not a flip");
}

/* ------------------------------------------------- copy style + reflow */
{
  // Pasting a style must never move or resize the target.
  const forbidden = ["left", "top", "width", "height", "position", "transform", "z-index"];
  for (const prop of forbidden) {
    assert.ok(
      !(STYLE_COPY_PROPS as readonly string[]).includes(prop),
      `copiar estilo must not carry ${prop}`
    );
  }
  // Shorthands stay out: their computed value is a long serialization that
  // does not read back as the thing it describes. The longhands cover them.
  for (const prop of ["background", "border", "padding"]) {
    assert.ok(
      !(STYLE_COPY_PROPS as readonly string[]).includes(prop),
      `${prop} is a shorthand; copy its longhands instead`
    );
  }
  for (const prop of ["background-color", "border-width", "padding-top"]) {
    assert.ok(
      (STYLE_COPY_PROPS as readonly string[]).includes(prop),
      `${prop} has to be copied, since the shorthand is not`
    );
  }

  // Every copyable property is cleared before the snapshot goes on, so a neon
  // glow cannot survive under a plain style.
  const patch = styleSnapshotPatch({ color: "#fff" });
  assert.equal(patch.color, "#fff");
  for (const prop of TEXT_EFFECT_PROPS) {
    assert.equal(patch[prop], "", `${prop} is cleared by a paste`);
  }

  // Only the scalable declarations move; the rest pass through byte for byte.
  assert.equal(scaleStyleLengths("left:100px;top:50px", 0.5), "left:50px;top:25px");
  assert.equal(
    scaleStyleLengths("padding:10px 20px;font-size:32px", 2),
    "padding:20px 40px;font-size:64px"
  );
  assert.equal(
    scaleStyleLengths("border-width:2px;background-position:10px 10px", 4),
    "border-width:2px;background-position:10px 10px",
    "hairlines and background art keep their px"
  );
  assert.equal(
    scaleStyleLengths("background:linear-gradient(90deg, #a, #b);width:10px", 2),
    "background:linear-gradient(90deg, #a, #b);width:20px",
    "a comma inside a value is not a declaration break"
  );
  assert.equal(scaleStyleLengths("width:10px", 1), "width:10px", "k=1 is a no-op");
  assert.equal(scaleStyleLengths("", 2), "", "an empty style stays empty");

  // 4:5 -> 9:16 keeps the width, so the uniform factor is 1 and the content
  // only re-centres vertically.
  const square = { width: 1080, height: 1080 };
  const story = { width: 1080, height: 1920 };
  const wide = reflowTransform(square, story, { left: 0, top: 0, width: 1080, height: 1080 });
  assert.equal(wide.k, 1);
  assert.equal(wide.dx, 0);
  assert.equal(wide.dy, 420, "a full-bleed square centres in a story");

  // The other direction has to shrink: 1920 tall content into 1080.
  const tall = reflowTransform(story, square, { left: 0, top: 0, width: 1080, height: 1920 });
  assert.equal(tall.k, 0.5625);
  assert.equal(tall.dy, 0);
  assert.equal(tall.dx, 236.25, "the scaled content centres horizontally");

  // An empty slide only changes canvas.
  assert.deepEqual(reflowTransform(square, story, null), { k: 1, dx: 0, dy: 0 });
}

/* ------------------------------------------------------- slide audit */
{
  const box = (over: Partial<MeasuredBox>): MeasuredBox => ({
    name: "Elemento",
    text: "hola",
    left: 100,
    top: 100,
    width: 400,
    height: 200,
    scrollWidth: 400,
    scrollHeight: 200,
    painted: true,
    childCount: 0,
    ...over,
  });
  const W = 1080;
  const H = 1350;

  assert.deepEqual(findIssues([box({})], W, H), [], "a clean element says nothing");

  // The real defect measured in "La regla de los 5 minutos": a 140px square at
  // left -171 ends at -31, so none of it is on the slide.
  const gone = findIssues([box({ name: "Cuadrado", left: -171, width: 140 })], W, H);
  assert.equal(gone.length, 1, "an element entirely off-canvas is reported once");
  assert.match(gone[0], /completamente fuera/);
  assert.match(gone[0], /Cuadrado/, "the warning names the layer");

  // The other real one: declared 920px wide, the text needs 932.
  const cut = findIssues([box({ width: 920, scrollWidth: 932 })], W, H);
  assert.equal(cut.length, 1);
  assert.match(cut[0], /se corta/);
  assert.match(cut[0], /932px/, "the warning carries the measured number");

  assert.match(findIssues([box({ height: 0 })], W, H)[0], /altura 0px/);
  assert.match(findIssues([box({ width: 0 })], W, H)[0], /ancho 0px/);

  assert.match(
    findIssues([box({ text: "", painted: false, childCount: 0 })], W, H)[0],
    /vac/,
    "a box with no text, no fill and no children is dead weight"
  );

  // A shape bleeding off the edge is deliberate design; only text is reported.
  assert.deepEqual(
    findIssues([box({ text: "", left: -40 })], W, H),
    [],
    "an untexted shape may bleed past the edge"
  );
  assert.match(
    findIssues([box({ left: -40 })], W, H)[0],
    /se sale.*40px por la izquierda/,
    "text hanging off the edge is always a bug"
  );

  // Sub-pixel rounding must not produce a warning.
  assert.deepEqual(
    findIssues([box({ width: 920, scrollWidth: 921, left: -1 })], W, H),
    [],
    "a 1px difference is rounding, not a defect"
  );

  // An invisible element reports once, not once per rule it also breaks.
  assert.equal(
    findIssues([box({ left: -900, width: 140, scrollWidth: 999, height: 0 })], W, H).length,
    1,
    "off-canvas short-circuits the rest"
  );
}

// --------------------------------------------------------- agent status lines
{
  const item = (over: Record<string, unknown>) =>
    ENGINES.codex.createParser()(JSON.stringify({ type: "item.started", item: over }));

  // Code mode wraps every shell call in JavaScript. The status has to be the
  // command, not the wrapper prefix every call shares.
  assert.deepEqual(
    item({
      type: "command_execution",
      command:
        'const r = await tools.exec_command({"cmd":"curl.exe -s -X PUT \'http://localhost:3000/api/carousels/abc/slides/def\'"});',
    }),
    [{ type: "status", text: "PUT /carousels/abc/slides/def" }],
    "a wrapped curl reports the route it hits"
  );

  assert.deepEqual(
    item({
      type: "command_execution",
      command:
        'const r = await tools.exec_command({"cmd":"Copy-Item -LiteralPath \'C:\\\\Users\\\\m\\\\.codex\\\\generated_images\\\\a\\\\e.png\'"});',
    }),
    [{ type: "status", text: "Guardando imagen…" }],
    "copying out of generated_images still reads as saving an image"
  );

  // The three items that used to emit nothing, which is what made a working
  // run look hung for minutes at a time.
  assert.deepEqual(
    statusForSlowItem({
      type: "file_change",
      changes: { "C:\\Users\\m\\AppData\\Local\\Temp\\pryzmo-slides.ps1": { type: "add" } },
    }),
    "Escribiendo pryzmo-slides.ps1…"
  );
  assert.deepEqual(
    statusForSlowItem({
      type: "image_view",
      path: "file:///C:/Users/m/Desktop/Slides%20Lab/public/uploads/magnifier.png",
    }),
    "Mirando magnifier.png…",
    "a percent-encoded file:// URL still yields a readable name"
  );
  assert.equal(
    statusForSlowItem({ type: "extension", kind: "image_gen.generation" }),
    "Generando imagen…"
  );
  assert.equal(
    statusForSlowItem({ type: "command_execution", command: "ls" }),
    null,
    "ordinary items are left to the existing branches"
  );

  // Unlike command_execution, these are accepted on completion too: code mode
  // does not reliably announce a start for them.
  assert.deepEqual(
    ENGINES.codex.createParser()(
      JSON.stringify({
        type: "item.completed",
        item: { type: "image_view", path: "/tmp/oc-slide-1.png" },
      })
    ),
    [{ type: "status", text: "Mirando oc-slide-1.png…" }],
    "a completed image_view still reports"
  );
}

// ------------------------------------------------------------- upload inlining
{
  // The escaped form is what the canvas produces, and missing it shipped
  // carousels whose images were simply absent from the PNG.
  assert.deepEqual(
    findUploadRefs('<div style="background-image: url(&quot;/uploads/a.png&quot;)"></div>'),
    ["/uploads/a.png"],
    "a canvas-reserialised url() is found"
  );
  assert.deepEqual(
    findUploadRefs("<div style=\"background-image: url('/uploads/b.png')\"></div>"),
    ["/uploads/b.png"],
    "a hand-written url() is found"
  );
  assert.deepEqual(
    findUploadRefs('<div style="background-image: url(/uploads/c.png)"></div>'),
    ["/uploads/c.png"],
    "an unquoted url() is found"
  );
  assert.deepEqual(
    findUploadRefs('<img src="/uploads/d.png">'),
    ["/uploads/d.png"],
    "a plain img src is found"
  );

  // The closing entity must not be swallowed into the path, or the file read
  // fails and the reference is left untouched — the original bug, one step on.
  assert.equal(
    findUploadRefs('url(&quot;/uploads/e.png&quot;)')[0].endsWith(".png"),
    true,
    "the path stops before the closing entity"
  );

  // One read, one replacement pass, both references rewritten.
  assert.deepEqual(
    findUploadRefs(
      '<img src="/uploads/f.png"><div style="background:url(&quot;/uploads/f.png&quot;)"></div>'
    ),
    ["/uploads/f.png"],
    "a file used twice is listed once"
  );

  assert.deepEqual(
    findUploadRefs('<img src="/other/g.png"><div style="background:url(#grad)"></div>'),
    [],
    "only /uploads/ is inlined"
  );

  assert.equal(resolveUploadPath("/srv/public", "/uploads/../x"), null, "traversal out of uploads is rejected");
  assert.ok(resolveUploadPath("/srv/public", "/uploads/a.png"), "a plain upload resolves");
}

console.log(
  "canvas geometry + history + elements + effects + reflow + audit + status + uploads: all checks passed"
);
