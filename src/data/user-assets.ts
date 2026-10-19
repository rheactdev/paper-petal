export type AssetKind = "font" | "sticker";
export const imageTypes = ["image/png", "image/jpeg", "image/webp"] as const;
export const fontTypes = [
  "font/ttf",
  "font/otf",
  "font/woff",
  "font/woff2",
] as const;
export const assetLimit = (kind: AssetKind) =>
  (kind === "font" ? 10 : 20) * 1024 * 1024;
export type UserAsset = {
  id: string;
  kind: AssetKind;
  name: string;
  mimeType: string;
  size: number;
  hash: string;
};
export const assetFileURL = (id: string) =>
  `/api/assets/${encodeURIComponent(id)}`;

// Inspect bytes rather than trusting the browser's MIME type or the filename.
export function detectAssetType(bytes: Uint8Array): string | null {
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length < 12) return null;
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b))
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (
    (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) ||
    ascii(0, 4) === "true"
  )
    return "font/ttf";
  return (
    (
      { OTTO: "font/otf", wOFF: "font/woff", wOF2: "font/woff2" } as Record<
        string,
        string
      >
    )[ascii(0, 4)] ?? null
  );
}

export function validateAssetBytes(kind: AssetKind, bytes: Uint8Array) {
  if (!bytes.length || bytes.length > assetLimit(kind))
    throw new Error(
      `Choose a ${kind} smaller than ${kind === "font" ? 10 : 20} MB.`,
    );
  const mime = detectAssetType(bytes);
  const allowed: readonly string[] = kind === "font" ? fontTypes : imageTypes;
  if (!mime || !allowed.includes(mime))
    throw new Error(
      kind === "font"
        ? "Choose a TTF, OTF, WOFF or WOFF2 font."
        : "Choose a PNG, JPEG or WebP sticker.",
    );
  return mime;
}
