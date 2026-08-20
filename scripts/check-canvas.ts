// Self-check for the canvas snapping math. Run: npm run check:canvas
// No framework on purpose — plain asserts, plain node.
import assert from "node:assert/strict";
import {
  computeSnap,
  clamp,
  SAFE_MARGIN,
  SNAP_THRESHOLD,
  type Box,
} from "../src/lib/canvas-utils.ts";

const W = 1080;
const H = 1350;
const box = (left: number, top: number, width = 200, height = 100): Box => ({
  left,
  top,
  width,
  height,
});

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
  const near = box(W / 2 - 100 + 2, 600); // 2px from centre
  const r = computeSnap(near, [box(W / 2 - 100 + 7, 100)], W, H);
  assert.equal(r.left, W / 2 - near.width / 2, "nearest target should win");
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

console.log("canvas-utils: all checks passed");
