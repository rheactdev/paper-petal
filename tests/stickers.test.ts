import { afterEach, describe, expect, it, vi } from "vitest";
import { newDocument } from "../src/data/templates";
import { createObject, normaliseDocument, syncPages } from "../src/data/model";
import {
  basicStickers,
  dropOnPage,
  filterStickers,
  isRasterObject,
  placeSticker,
  pngCatalogue,
  stickerSize,
} from "../src/data/stickers";
import { stickerCatalogue } from "../src/data/sticker-catalogue";
import { prepareSticker } from "../src/components/paper/stickers.client";
import { trackStickerDrag } from "../src/components/paper/sticker-drag";
vi.mock("@tanstack/react-start/client-only", () => ({}));
afterEach(() => vi.restoreAllMocks());

const entry = pngCatalogue({
  "/src/assets/stickers/Games/gameboy_pink.png": "/asset.png",
})[0];
describe("sticker catalogue and placement", () => {
  it("discovers nested categories, root files and PNGs only", () => {
    const catalogue = pngCatalogue({
      "/src/assets/stickers/Animals/Cats/sleepy_cat.PNG": "/cat.png",
      "/src/assets/stickers/star.png": "/star.png",
      "/src/assets/stickers/readme.md": "/readme.md",
      "/src/assets/other.png": "/other.png",
    });
    expect(catalogue).toEqual([
      {
        id: "Animals/Cats/sleepy_cat.PNG",
        name: "Sleepy Cat",
        category: "Animals / Cats",
        kind: "png",
        assetURL: "/cat.png",
      },
      {
        id: "star.png",
        name: "Star",
        category: "Unsorted",
        kind: "png",
        assetURL: "/star.png",
      },
    ]);
    expect(stickerCatalogue).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "MochiKichiGift/gameboy_pink.png",
          category: "MochiKichiGift",
          kind: "png",
          assetURL: expect.any(String),
        }),
      ]),
    );
    expect(
      stickerCatalogue.filter((item) => item.category === "Basics"),
    ).toHaveLength(5);
  });
  it("searches filenames and categories together, independently of case", () => {
    expect(filterStickers([entry, ...basicStickers], "games pink")).toEqual([
      entry,
    ]);
    expect(
      filterStickers([entry, ...basicStickers], " GAMEBOY_PINK ", "Games"),
    ).toEqual([entry]);
    expect(filterStickers([entry, ...basicStickers], "pink", "Basics")).toEqual(
      [],
    );
    expect(
      filterStickers([entry, ...basicStickers], "", "Basics"),
    ).toHaveLength(5);
  });
  it("makes the longest edge 25 mm without stretching portrait or landscape PNGs", () => {
    expect(stickerSize(200, 100)).toEqual({
      width: 25,
      height: 12.5,
      aspectRatio: 2,
    });
    expect(stickerSize(100, 200)).toEqual({
      width: 12.5,
      height: 25,
      aspectRatio: 0.5,
    });
    for (const value of [0, -1, Infinity, NaN])
      expect(() => stickerSize(value, 100)).toThrow();
  });
  it("converts rendered bounds at different zooms and scroll offsets into page millimetres", () => {
    const paper = newDocument().paper;
    for (const zoom of [0.3, 0.8, 1.5, 2]) {
      const rect = {
        left: -60 + 600 * zoom,
        top: -200,
        width: ((148 * 96) / 25.4) * zoom,
        height: ((210 * 96) / 25.4) * zoom,
      };
      const target = dropOnPage(
        rect.left + rect.width * 0.75,
        rect.top + rect.height * 0.25,
        rect,
        paper,
        "right-page",
      );
      expect(target?.pageId).toBe("right-page");
      expect(target?.x).toBeCloseTo(111);
      expect(target?.y).toBeCloseTo(52.5);
      expect(
        dropOnPage(rect.left - 1, rect.top, rect, paper, "left-page"),
      ).toBeNull();
    }
  });
  it("centres on the stable target page without clamping edge overflow and preserves decorated pages", () => {
    const doc = newDocument();
    doc.pages.push({ id: "second", objects: [] });
    const placed = placeSticker(
      doc,
      entry,
      { assetId: "stored", ...stickerSize(200, 100) },
      { pageId: "second", x: 2, y: 3 },
    );
    expect(placed.object).toMatchObject({
      type: "sticker",
      assetId: "stored",
      x: -10.5,
      y: -3.25,
      width: 25,
      height: 12.5,
      keepRatio: true,
    });
    expect(placed.document.pages[0]).toEqual(doc.pages[0]);
    expect(doc.pages[1].objects).toEqual([]);
    expect(normaliseDocument(placed.document).pages[1].objects).toHaveLength(1);
    expect(syncPages(placed.document.pages, 1)).toHaveLength(2);
    expect(() =>
      placeSticker(doc, entry, {}, { pageId: "removed", x: 0, y: 0 }),
    ).toThrow("no longer");
  });
  it("keeps existing SVG stickers and pictures compatible", () => {
    expect(isRasterObject(createObject("sticker"))).toBe(false);
    expect(isRasterObject(createObject("sticker", { assetId: "png" }))).toBe(
      true,
    );
    expect(isRasterObject(createObject("image"))).toBe(true);
    const doc = newDocument();
    const placed = placeSticker(
      doc,
      basicStickers[0],
      {},
      { pageId: doc.pages[0].id, x: 74, y: 105 },
    );
    expect(placed.object).toMatchObject({
      type: "sticker",
      sticker: "flower",
      width: 25,
      height: 25,
      x: 61.5,
      y: 92.5,
    });
    expect(placed.object.assetId).toBeUndefined();
  });
});

describe("PNG preparation", () => {
  const blob = new Blob(["original PNG bytes"], { type: "image/png" });
  const dependencies = () => ({
    fetch: vi.fn(async () => new Response(blob)),
    decode: vi.fn(async () => stickerSize(171, 143)),
    save: vi.fn(async (_blob: Blob) => "local-asset"),
  });
  it("decodes before saving and preserves the original bytes", async () => {
    const deps = dependencies();
    const props = await prepareSticker(entry, deps);
    expect(props).toMatchObject({
      assetId: "local-asset",
      width: 25,
      aspectRatio: 171 / 143,
    });
    expect(await deps.save.mock.calls[0][0].text()).toBe("original PNG bytes");
    expect(deps.decode.mock.invocationCallOrder[0]).toBeLessThan(
      deps.save.mock.invocationCallOrder[0],
    );
  });
  it("rejects unavailable, wrong-format, corrupt and unpersistable stickers", async () => {
    const missing = dependencies();
    missing.fetch.mockResolvedValue(new Response(null, { status: 404 }));
    await expect(prepareSticker(entry, missing)).rejects.toThrow(
      "could not be loaded",
    );
    expect(missing.save).not.toHaveBeenCalled();
    const wrong = dependencies();
    wrong.fetch.mockResolvedValue(
      new Response(new Blob(["html"], { type: "text/html" })),
    );
    await expect(prepareSticker(entry, wrong)).rejects.toThrow("PNG");
    const corrupt = dependencies();
    corrupt.decode.mockRejectedValue(new Error("Invalid PNG"));
    await expect(prepareSticker(entry, corrupt)).rejects.toThrow("Invalid PNG");
    expect(corrupt.save).not.toHaveBeenCalled();
    const quota = dependencies();
    quota.save.mockRejectedValue(new Error("Storage quota exceeded"));
    await expect(prepareSticker(entry, quota)).rejects.toThrow("quota");
  });
  it("does not fetch or store vector stickers", async () => {
    const deps = dependencies();
    expect(await prepareSticker(basicStickers[0], deps)).toEqual({});
    expect(deps.fetch).not.toHaveBeenCalled();
    expect(deps.save).not.toHaveBeenCalled();
  });
});

function pointer(type: string, x: number, y: number, pointerId = 1) {
  return Object.assign(new Event(type, { cancelable: true }), {
    clientX: x,
    clientY: y,
    pointerId,
  }) as PointerEvent;
}
function dragFixture() {
  const host = new EventTarget() as Window;
  const callbacks = {
    target: vi.fn((x: number, y: number) =>
      x >= 100 ? { pageId: "page-two", x, y } : null,
    ),
    preview: vi.fn(),
    finish: vi.fn(),
  };
  const dispose = trackStickerDrag(
    host,
    pointer("pointerdown", 10, 10),
    callbacks,
  );
  return { host, callbacks, dispose };
}
describe("palette pointer lifecycle", () => {
  it("commits only once at release and suppresses a second click insertion", () => {
    const { host, callbacks } = dragFixture();
    for (const x of [20, 80, 120, 140])
      host.dispatchEvent(pointer("pointermove", x, 50));
    expect(callbacks.finish).not.toHaveBeenCalled();
    host.dispatchEvent(pointer("pointerup", 140, 50));
    host.dispatchEvent(pointer("pointerup", 140, 50));
    expect(callbacks.finish).toHaveBeenCalledExactlyOnceWith(
      { pageId: "page-two", x: 140, y: 50 },
      true,
    );
    expect(callbacks.preview).toHaveBeenLastCalledWith(null);
  });
  it("keeps clicks and keyboard insertion separate from drag activation", () => {
    const { host, callbacks } = dragFixture();
    host.dispatchEvent(pointer("pointermove", 12, 11));
    host.dispatchEvent(pointer("pointerup", 12, 11));
    expect(callbacks.finish).toHaveBeenCalledExactlyOnceWith(null, false);
  });
  it.each(["escape", "pointercancel", "blur", "unmount", "outside"])(
    "cancels %s without inserting or leaving listeners",
    (reason) => {
      const { host, callbacks, dispose } = dragFixture();
      host.dispatchEvent(pointer("pointermove", 140, 50));
      if (reason === "escape")
        host.dispatchEvent(
          Object.assign(new Event("keydown"), { key: "Escape" }),
        );
      if (reason === "pointercancel")
        host.dispatchEvent(pointer("pointercancel", 140, 50));
      if (reason === "blur") host.dispatchEvent(new Event("blur"));
      if (reason === "unmount") dispose();
      if (reason === "outside")
        host.dispatchEvent(pointer("pointerup", 20, 50));
      host.dispatchEvent(pointer("pointerup", 140, 50));
      host.dispatchEvent(pointer("pointermove", 150, 50));
      expect(callbacks.finish).toHaveBeenCalledExactlyOnceWith(null, true);
      expect(callbacks.preview).toHaveBeenLastCalledWith(null);
    },
  );
  it("ignores events belonging to a different pointer", () => {
    const { host, callbacks } = dragFixture();
    host.dispatchEvent(pointer("pointermove", 140, 50, 2));
    host.dispatchEvent(pointer("pointercancel", 140, 50, 2));
    host.dispatchEvent(pointer("pointerup", 140, 50, 2));
    expect(callbacks.finish).not.toHaveBeenCalled();
    host.dispatchEvent(pointer("pointerup", 12, 11));
    expect(callbacks.finish).toHaveBeenCalledExactlyOnceWith(null, false);
  });
});
