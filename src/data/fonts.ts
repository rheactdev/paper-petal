import { z } from "zod";

export const paperFonts = [
  "Lora",
  "DM Sans",
  "Caveat",
  "Elliot Letters Bold",
  "Minuet",
  "Drizzly Sunday"
] as const;

export const customFontFamily = z.string().regex(/^petal-font-[a-f0-9]{64}$/);
export const paperFontSchema = z.union([z.enum(paperFonts), customFontFamily]);
export const documentFontSchema = z
  .object({
    family: customFontFamily,
    name: z.string().min(1).max(200),
    assetId: z.string().min(1),
  })
  .strict();
export type DocumentFont = z.infer<typeof documentFontSchema>;
export type PaperFont = z.infer<typeof paperFontSchema>;
export const fontFamilyForHash = (hash: string) =>
  customFontFamily.parse(`petal-font-${hash}`);
export type MeasurePaperText = (text: string, size: number) => number;
