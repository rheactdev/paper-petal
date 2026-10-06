import { describe, expect, it } from "vitest";
import {
  buildLetterLayout,
  cropPage,
  intersectRects,
  printSearch,
} from "../src/data/print-layout";
import { newDocument } from "../src/data/templates";

const a5 = { width: 148, height: 210 };
const content = { x: 12, y: 12, width: 124, height: 186 };
const crops = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    cropPage(`page-${i}`, i, a5, [content]),
  );

describe("Letter sheet layout", () => {
  it("validates print settings and defaults malformed URL values", () => {
    expect(printSearch.parse({})).toEqual({
      mode: "document",
      inset: 6,
      background: "content",
    });
    expect(
      printSearch.parse({ mode: "letter", inset: "8.5", background: "paper" }),
    ).toEqual({ mode: "letter", inset: 8.5, background: "paper" });
    for (const inset of ["bad", -1, 26, Infinity]) {
      expect(
        printSearch.parse({ mode: "booklet", inset, background: "bad" }),
      ).toEqual({ mode: "document", inset: 6, background: "content" });
    }
  });
  it("pairs entries sequentially and leaves one empty slot for odd counts", () => {
    const layout = buildLetterLayout(a5, crops(5));
    expect(
      layout.sheets.map((sheet) =>
        sheet.entries.map((entry) => entry.crop?.pageIndex ?? null),
      ),
    ).toEqual([
      [0, 1],
      [2, 3],
      [4, null],
    ]);
    expect(buildLetterLayout(a5, crops(4)).sheets).toHaveLength(2);
    expect(layout.errors).toEqual([]);
  });
  it("places portrait entries side by side on landscape Letter with exact insets and gap", () => {
    const layout = buildLetterLayout(a5, crops(2));
    expect([layout.width, layout.height, layout.orientation]).toEqual([
      279.4,
      215.9,
      "landscape",
    ]);
    const [first, second] = layout.sheets[0].entries;
    expect(first.slot.x).toBe(6);
    expect(first.slot.y).toBe(6);
    expect(first.slot.width).toBeCloseTo(130.7);
    expect(first.slot.height).toBeCloseTo(203.9);
    expect(second.slot.x - first.slot.x - first.slot.width).toBeCloseTo(6);
    expect(layout.width - second.slot.x - second.slot.width).toBeCloseTo(6);
    expect(first.position!.x - first.slot.x).toBeCloseTo(
      (first.slot.width - first.crop!.rect.width) / 2,
    );
    expect(first.crop!.rect.width).toBe(128);
    expect(first.crop!.rect.height).toBe(190);
  });
  it("stacks landscape entries on portrait Letter without rotating or scaling content", () => {
    const paper = { width: 210, height: 148 };
    const entries = Array.from({ length: 2 }, (_, i) =>
      cropPage(`landscape-${i}`, i, paper, [
        { x: 12, y: 12, width: 186, height: 124 },
      ]),
    );
    const layout = buildLetterLayout(paper, entries);
    expect([layout.width, layout.height, layout.orientation]).toEqual([
      215.9,
      279.4,
      "portrait",
    ]);
    const [first, second] = layout.sheets[0].entries;
    expect(second.slot.y - first.slot.y - first.slot.height).toBeCloseTo(6);
    expect(second.slot.x).toBe(first.slot.x);
    expect(first.crop!.rect).toEqual({ x: 10, y: 10, width: 190, height: 128 });
    expect(layout.errors).toEqual([]);
  });
  it("retains intentional blank entries and decorated pages in their original order", () => {
    const entries = [
      cropPage("blank", 0, a5, []),
      cropPage("decorated", 1, a5, [{ x: 20, y: 160, width: 35, height: 25 }]),
      cropPage("trailing-blank", 2, a5, []),
    ];
    const layout = buildLetterLayout(a5, entries);
    expect(layout.sheets).toHaveLength(2);
    expect(layout.sheets[0].entries[0].crop?.empty).toBe(true);
    expect(layout.sheets[0].entries[1].crop?.rect).toEqual({
      x: 18,
      y: 158,
      width: 39,
      height: 29,
    });
    expect(layout.sheets[1].entries[0].crop?.pageId).toBe("trailing-blank");
    expect(layout.sheets[1].entries[1].crop).toBeNull();
  });
  it("reports both excess dimensions without shrinking a crop", () => {
    const full = cropPage("full", 0, a5, [
      { x: 0, y: 0, width: 148, height: 210 },
    ]);
    const layout = buildLetterLayout(a5, [full]);
    expect(layout.errors[0].pageIndex).toBe(0);
    expect(layout.errors[0].excessWidth).toBeCloseTo(17.3);
    expect(layout.errors[0].excessHeight).toBeCloseTo(6.1);
    expect(layout.sheets[0].entries[0].crop!.rect).toEqual(full.rect);
    expect(buildLetterLayout(a5, [full], 0).errors[0].excessWidth).toBeCloseTo(
      11.3,
    );
  });
  it("recomputes fitting and centring when the printer inset changes", () => {
    expect(buildLetterLayout(a5, crops(1), 6).errors).toEqual([]);
    expect(
      buildLetterLayout(a5, crops(1), 10).errors[0].excessWidth,
    ).toBeCloseTo(1.3);
    expect(buildLetterLayout(a5, crops(1), 0).sheets[0].entries[0].slot.x).toBe(
      0,
    );
  });
  it("unions rendered text and rotated decoration bounds, preserving interior gaps", () => {
    // This is the axis-aligned painted bound of a 20 × 40 mm object rotated 90°.
    const rotated = { x: 85, y: 170, width: 40, height: 20 };
    const crop = cropPage("mixed", 0, a5, [
      { x: 15, y: 20, width: 80, height: 10 },
      rotated,
    ]);
    expect(crop.rect).toEqual({ x: 13, y: 18, width: 114, height: 174 });
  });
  it("clips bounds to the original page and caps padding at the paper edges", () => {
    const crop = cropPage("edge", 0, a5, [
      { x: -10, y: -10, width: 40, height: 30 },
    ]);
    expect(crop.rect).toEqual({ x: 0, y: 0, width: 32, height: 22 });
    expect(
      intersectRects(
        { x: 160, y: 10, width: 10, height: 10 },
        { x: 0, y: 0, ...a5 },
      ),
    ).toBeNull();
    expect(
      cropPage("outside", 0, a5, [{ x: 160, y: 0, width: 10, height: 10 }])
        .empty,
    ).toBe(true);
  });
  it("does not mutate document geometry or crop records", () => {
    const doc = newDocument("journal");
    const entries = crops(3);
    const snapshot = JSON.stringify({ doc, entries });
    buildLetterLayout(doc.paper, entries, 12);
    expect(JSON.stringify({ doc, entries })).toBe(snapshot);
  });
});
