import "fake-indexeddb/auto";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveFontAsset } from "../src/data/storage";
import { loadDocumentFont, measurePaperFont } from "../src/editor/fonts.client";
import { newWeeklyDocument, sampleWeek } from "../src/data/weekly";

afterEach(() => vi.unstubAllGlobals());
describe("custom font rendering", () => {
  it("loads once before measurement, reports missing/corrupt faces, and allows retry", async () => {
    const bytes = await readFile(
      new URL("../src/assets/fonts/Minuet.otf", import.meta.url),
    );
    const assetId = await saveFontAsset(new Blob([bytes]));
    const font = {
      family: `petal-font-${createHash("sha256").update(bytes).digest("hex")}`,
      name: "Minuet.otf",
      assetId,
    };
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("bad browser decode"))
      .mockResolvedValue(undefined);
    const add = vi.fn();
    const measureText = vi.fn(() => ({ width: 96 }));
    vi.stubGlobal(
      "FontFace",
      class {
        load = load;
      },
    );
    vi.stubGlobal("document", {
      fonts: { add, ready: Promise.resolve(), load: vi.fn(async () => [{}]) },
      createElement: () => ({ getContext: () => ({ font: "", measureText }) }),
    });
    await expect(
      loadDocumentFont({ ...font, assetId: "missing-font" }),
    ).rejects.toThrow("missing");
    await expect(loadDocumentFont(font)).rejects.toThrow("couldn’t be loaded");
    expect(add).not.toHaveBeenCalled();
    await loadDocumentFont(font);
    await loadDocumentFont(font);
    expect(load).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenCalledTimes(1);
    const measure = await measurePaperFont(font.family);
    expect(measure("Hello", 12)).toBeCloseTo(25.4);
    expect(measure("Hello", 12)).toBeCloseTo(25.4);
    expect(measureText).toHaveBeenCalledTimes(1);
  });
  it("carries custom font metadata through calendar generation and uses supplied measurements", () => {
    const font = {
      family: `petal-font-${"c".repeat(64)}`,
      name: "Personal.woff2",
      assetId: "local-personal-font",
    };
    const measureText = vi.fn(
      (text: string, size: number) => text.length * size * 0.1,
    );
    const result = newWeeklyDocument(sampleWeek("2026-10-12", "UTC"), {
      week: "2026-10-12",
      timeZone: "UTC",
      theme: "botanical",
      privateTitles: false,
      locations: false,
      eventKey: false,
      font: font.family,
      customFonts: [font],
      measureText,
    });
    expect(result.document.customFonts).toEqual([font]);
    expect(result.document.typography.font).toBe(font.family);
    expect(
      result.document.pages
        .flatMap((page) => page.objects)
        .some((object) => object.font === font.family),
    ).toBe(true);
    expect(measureText).toHaveBeenCalled();
  });
});
