import { MM } from "../data/model";
import type { MeasurePaperText, PaperFont } from "../data/fonts";
import type { DocumentFont } from "../data/fonts";
import { getAsset } from "../data/storage";

const loaded = new Map<string, Promise<void>>();
export async function loadDocumentFont(font: DocumentFont) {
  const blob = await getAsset(font.assetId);
  if (!blob)
    throw new Error(
      `The font “${font.name}” is missing. Restore a document backup.`,
    );
  const bytes = await blob.arrayBuffer();
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  if (font.family !== `petal-font-${hash}`)
    throw new Error(
      `The font “${font.name}” does not match its document definition. Restore a backup.`,
    );
  if (!loaded.has(font.family)) {
    const promise = (async () => {
      const face = new FontFace(font.family, bytes);
      await face.load();
      document.fonts.add(face);
    })();
    loaded.set(font.family, promise);
    promise.catch(() => loaded.delete(font.family));
  }
  try {
    await loaded.get(font.family);
  } catch {
    throw new Error(
      `The font “${font.name}” couldn’t be loaded. Try another font or restore a backup.`,
    );
  }
}

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
