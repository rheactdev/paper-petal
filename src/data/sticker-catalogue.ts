import { basicStickers, pngCatalogue } from "./stickers";

// Vite bundles these assets; no server filesystem or external image service.
export const stickerCatalogue = [
  ...pngCatalogue(
    import.meta.glob<string>("../assets/stickers/**/*.[pP][nN][gG]", {
      eager: true,
      query: "?url",
      import: "default",
    }),
  ),
  ...basicStickers,
];
