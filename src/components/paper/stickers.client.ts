import "@tanstack/react-start/client-only";
import { saveAsset } from "../../data/storage";
import { stickerSize, type StickerEntry } from "../../data/stickers";

async function decodeSticker(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return stickerSize(image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareSticker(
  entry: StickerEntry,
  dependencies = {
    fetch: (url: string) => fetch(url),
    decode: decodeSticker,
    save: saveAsset,
  },
) {
  if (entry.kind === "svg") return {};
  const response = await dependencies.fetch(entry.assetURL);
  if (!response.ok)
    throw new Error("This sticker could not be loaded. Please try again.");
  const blob = await response.blob();
  if (blob.type !== "image/png" || blob.size > 20 * 1024 * 1024)
    throw new Error("Choose a PNG sticker smaller than 20 MB.");
  const size = await dependencies.decode(blob);
  const assetId = await dependencies.save(blob);
  return { ...size, assetId };
}
