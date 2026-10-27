/**
 * Whitelisting a JSON body before it reaches an `Object.assign`.
 *
 * A TypeScript `Pick<>` on the update functions does not exist at runtime: a
 * PUT that passed the body straight through could write `slides`, `id`,
 * `createdAt` or `referenceImages` (and with it the path the agent reads).
 */
export type Check = (v: unknown) => boolean;

export const isString: Check = (v) => typeof v === "string";
export const isStringArray: Check = (v) => Array.isArray(v) && v.every(isString);
export const isObjectArray: Check = (v) =>
  Array.isArray(v) && v.every((x) => !!x && typeof x === "object" && !Array.isArray(x));
export const oneOf =
  (...values: unknown[]): Check =>
  (v) =>
    values.includes(v);
export const either =
  (...checks: Check[]): Check =>
  (v) =>
    checks.some((c) => c(v));

/**
 * Only the listed keys survive, and every one present must pass its check.
 * Unknown keys are dropped silently (the brand panel sends the whole object,
 * timestamps included); a known key with the wrong type rejects the body, null.
 */
export function pickFields<T>(
  body: unknown,
  checks: Partial<Record<keyof T, Check>>
): Partial<T> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const out: Record<string, unknown> = {};
  for (const [key, check] of Object.entries(checks) as [string, Check][]) {
    if (!Object.hasOwn(body, key)) continue;
    const v = (body as Record<string, unknown>)[key];
    if (v === undefined) continue;
    if (!check(v)) return null;
    out[key] = v;
  }
  return out as Partial<T>;
}
