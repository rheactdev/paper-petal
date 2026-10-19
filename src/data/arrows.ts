import { z } from "zod";

export const arrowStyleSchema = z.enum(["regular", "handdrawn"]);
export type ArrowStyle = z.infer<typeof arrowStyleSchema>;
export const ARROW_ROUGHNESS = {
  min: 0,
  max: 3,
  step: 0.1,
  default: 0.6,
} as const;
export const arrowRoughnessSchema = z
  .number()
  .min(ARROW_ROUGHNESS.min)
  .max(ARROW_ROUGHNESS.max)
  .default(ARROW_ROUGHNESS.default);
export const arrowSeedSchema = z
  .number()
  .int()
  .min(1)
  .max(2 ** 31 - 1);

/** Stable nonzero Rough.js seed, independent of render order or zoom. */
export function arrowSeedFromKey(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % (2 ** 31 - 1)) + 1;
}

export function arrowStyleChange(
  object: { id: string; arrowSeed?: number },
  arrowStyle: ArrowStyle,
): { arrowStyle: ArrowStyle; arrowSeed?: number } {
  return {
    arrowStyle,
    ...(arrowStyle === "handdrawn"
      ? { arrowSeed: object.arrowSeed ?? arrowSeedFromKey(object.id) }
      : {}),
  };
}
