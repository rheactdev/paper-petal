import { createObject, type PaperDocument, type PaperObject } from "./model";

type CatalogueEntry = { id: string; name: string; category: string };
export type StickerEntry = CatalogueEntry &
  (
    | { kind: "png"; assetURL: string }
    | { kind: "svg"; sticker: PaperObject["sticker"] }
  );
export type StickerDrop = { pageId: string; x: number; y: number };
export type ScreenRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function pngCatalogue(files: Record<string, string>): StickerEntry[] {
  return Object.entries(files)
    .flatMap(([path, assetURL]) => {
      const relative = path.split("/assets/stickers/")[1];
      if (!relative || !/\.png$/i.test(relative)) return [];
      const parts = relative.split("/");
      const filename = parts.pop()!.replace(/\.png$/i, "");
      return [
        {
          id: relative,
          name: filename
            .replace(/[_-]+/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase()),
          category: parts.join(" / ") || "Unsorted",
          kind: "png" as const,
          assetURL,
        },
      ];
    })
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    );
}

export const basicStickers: StickerEntry[] = [
  "flower",
  "leaf",
  "star",
  "tape",
  "heart",
].map((kind) => ({
  id: `basic:${kind}`,
  name: kind[0].toUpperCase() + kind.slice(1),
  category: "Basics",
  kind: "svg",
  sticker: kind as PaperObject["sticker"],
}));

export function filterStickers(
  entries: StickerEntry[],
  query: string,
  category = "All",
) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return entries.filter(
    (entry) =>
      (category === "All" || entry.category === category) &&
      words.every((word) =>
        `${entry.name} ${entry.id} ${entry.category}`
          .toLocaleLowerCase()
          .includes(word),
      ),
  );
}

export function stickerSize(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new Error("This sticker has invalid image dimensions.");
  const factor = 25 / Math.max(width, height);
  return {
    width: width * factor,
    height: height * factor,
    aspectRatio: width / height,
  };
}

export function insideRect(x: number, y: number, rect: ScreenRect) {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    x >= rect.left &&
    y >= rect.top &&
    x <= rect.left + rect.width &&
    y <= rect.top + rect.height
  );
}

export function dropOnPage(
  x: number,
  y: number,
  rect: ScreenRect,
  paper: PaperDocument["paper"],
  pageId: string,
): StickerDrop | null {
  if (!insideRect(x, y, rect)) return null;
  return {
    pageId,
    x: ((x - rect.left) / rect.width) * paper.width,
    y: ((y - rect.top) / rect.height) * paper.height,
  };
}

export function placeSticker(
  doc: PaperDocument,
  entry: StickerEntry,
  props: Partial<PaperObject>,
  drop: StickerDrop,
) {
  if (!doc.pages.some((page) => page.id === drop.pageId))
    throw new Error("That page is no longer available. Choose another page.");
  const object = createObject("sticker", {
    ...(entry.kind === "svg"
      ? { sticker: entry.sticker, width: 25, height: 25 }
      : {}),
    ...props,
    label: `${entry.name} sticker`.slice(0, 200),
  });
  object.x = drop.x - object.width / 2;
  object.y = drop.y - object.height / 2;
  return {
    object,
    document: {
      ...doc,
      pages: doc.pages.map((page) =>
        page.id === drop.pageId
          ? { ...page, objects: [...page.objects, object] }
          : page,
      ),
    },
  };
}

export function isRasterObject(object: PaperObject) {
  return (
    object.type === "image" || (object.type === "sticker" && !!object.assetId)
  );
}
