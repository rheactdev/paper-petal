import { MM } from "../data/model";
import type { MeasurePaperText, PaperFont } from "../data/fonts";

// Measure only after the selected local face is available. Widths are in mm,
// so calendar wrapping uses the same font and physical size as printed text.
export async function measurePaperFont(
  font: PaperFont,
): Promise<MeasurePaperText> {
  const faces = await document.fonts.load(`12pt "${font}"`);
  if (!faces.length)
    throw new Error("This font couldn’t be loaded. Try again.");
  await document.fonts.ready;
  const context = document.createElement("canvas").getContext("2d");
  if (!context)
    throw new Error("Font measurement isn’t available in this browser.");
  const widths = new Map<string, number>();
  return (text, size) => {
    const key = `${size}:${text}`;
    if (!widths.has(key)) {
      context.font = `${size}pt "${font}"`;
      widths.set(key, context.measureText(text).width / MM);
    }
    return widths.get(key)!;
  };
}
