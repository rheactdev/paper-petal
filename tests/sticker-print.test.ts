import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ObjectArtwork } from "../src/components/paper/art";
import { measurePageCrops } from "../src/components/paper/print-measurement.client";
import { createObject, MM, objectStyle } from "../src/data/model";
import { newDocument } from "../src/data/templates";
import { buildLetterLayout } from "../src/data/print-layout";
vi.mock("@tanstack/react-start/client-only", () => ({}));
afterEach(() => vi.unstubAllGlobals());

describe("shared sticker print artwork", () => {
  it("renders raster stickers as original images with no colour treatment", () => {
    const object = createObject("sticker", {
      assetId: "png",
      label: "Pink gameboy",
      color: "#ff0000",
      width: 25,
      height: 12.5,
    });
    const html = renderToStaticMarkup(
      createElement(ObjectArtwork, {
        object,
        assets: { png: "blob:stored-png" },
      }),
    );
    expect(html).toContain('src="blob:stored-png"');
    expect(html).toContain('alt="Pink gameboy"');
    expect(html).not.toContain("svg");
    expect(html).not.toContain("#ff0000");
    expect(objectStyle(object)).toMatchObject({
      width: 25 * MM,
      height: 12.5 * MM,
    });
  });
  it("retains SVG artwork and a clear missing-asset fallback", () => {
    const vector = renderToStaticMarkup(
      createElement(ObjectArtwork, {
        object: createObject("sticker", { sticker: "heart" }),
        assets: {},
      }),
    );
    expect(vector).toContain("<svg");
    const missing = renderToStaticMarkup(
      createElement(ObjectArtwork, {
        object: createObject("sticker", { assetId: "missing" }),
        assets: {},
      }),
    );
    expect(missing).toContain("Picture unavailable");
    expect(missing).not.toContain("<svg");
  });
  it("keeps rotated PNG bounds and 2 mm padding in an actual-size Letter crop", () => {
    const doc = newDocument();
    const sticker = createObject("sticker", {
      assetId: "png",
      x: 50,
      y: 60,
      width: 25,
      height: 12.5,
      rotation: 90,
    });
    doc.pages[0].objects = [sticker];
    const rect = (x: number, y: number, width: number, height: number) => ({
      left: x * MM,
      top: y * MM,
      right: (x + width) * MM,
      bottom: (y + height) * MM,
      width: width * MM,
      height: height * MM,
    });
    const element = {
      style: { opacity: "1" },
      getBoundingClientRect: () => rect(56.25, 53.75, 12.5, 25),
      querySelector: () => null,
    };
    const paper = {
      getBoundingClientRect: () => rect(0, 0, 148, 210),
      querySelector: () => null,
      querySelectorAll: () => [element],
    };
    const crops = measurePageCrops(
      { querySelector: () => paper } as unknown as HTMLElement,
      doc,
    );
    expect(crops[0].rect.x).toBeCloseTo(54.25);
    expect(crops[0].rect.y).toBeCloseTo(51.75);
    expect(crops[0].rect.width).toBeCloseTo(16.5);
    expect(crops[0].rect.height).toBeCloseTo(29);
    const layout = buildLetterLayout(doc.paper, crops);
    expect(layout.errors).toEqual([]);
    expect(layout.sheets[0].entries[0].crop?.rect).toEqual(crops[0].rect);
    expect(layout.sheets[0].entries[1].crop).toBeNull();
  });
});
