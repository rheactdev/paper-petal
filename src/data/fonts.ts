export const paperFonts = [
  "Lora",
  "DM Sans",
  "Caveat",
  "Elliot Letters Bold",
  "Minuet",
] as const;

export type PaperFont = (typeof paperFonts)[number];
export type MeasurePaperText = (text: string, size: number) => number;
