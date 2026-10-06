import { afterEach, describe, expect, it, vi } from "vitest";
import { MM } from "../src/data/model";
import { newDocument } from "../src/data/templates";
import { measurePageCrops } from "../src/components/paper/print-measurement.client";

vi.mock("@tanstack/react-start/client-only", () => ({}));
afterEach(() => vi.unstubAllGlobals());

// Measured browser geometry in mm. This isolates the crop calculation from
// font rasterization and exercises non-text checkboxes, including empty tasks.
function measure(
  labels: { x: number; y: number; width: number; height: number }[],
  textBounds: { x: number; y: number; width: number; height: number }[] = [],
) {
  const rect = (r: (typeof labels)[number]) => ({
    left: r.x * MM,
    top: r.y * MM,
    right: (r.x + r.width) * MM,
    bottom: (r.y + r.height) * MM,
    width: r.width * MM,
    height: r.height * MM,
  });
  const text = {
    querySelectorAll: (selector: string) =>
      selector.includes("> label")
        ? labels.map((r) => ({ getClientRects: () => [rect(r)] }))
        : [],
  };
  const clip = {
    getBoundingClientRect: () =>
      rect({ x: 12, y: 12, width: 124, height: 186 }),
    querySelector: () => text,
  };
  const paper = {
    getBoundingClientRect: () => rect({ x: 0, y: 0, width: 148, height: 210 }),
    querySelector: () => clip,
    querySelectorAll: () => [],
  };
  vi.stubGlobal("NodeFilter", { SHOW_TEXT: 4 });
  vi.stubGlobal("document", {
    createTreeWalker: () => {
      let visited = false;
      return {
        nextNode: () => {
          if (visited || !textBounds.length) return null;
          visited = true;
          return { textContent: "Task text" };
        },
      };
    },
    createRange: () => ({
      selectNodeContents: () => {},
      getClientRects: () => textBounds.map(rect),
    }),
  });
  return measurePageCrops(
    { querySelector: () => paper } as unknown as HTMLElement,
    newDocument("blank"),
  )[0];
}

describe("checklist Letter crops", () => {
  it("retains an empty task's checkbox with crop padding", () => {
    const crop = measure([{ x: 12, y: 12, width: 7, height: 7 }]);
    expect(crop.empty).toBe(false);
    expect(crop.rect.x).toBeCloseTo(10);
    expect(crop.rect.y).toBeCloseTo(10);
    expect(crop.rect.width).toBeCloseTo(11);
    expect(crop.rect.height).toBeCloseTo(11);
  });
  it("includes the checkbox beside its text without adding a bullet marker gutter", () => {
    const crop = measure(
      [{ x: 12, y: 12, width: 7, height: 7 }],
      [{ x: 19, y: 12, width: 35, height: 7 }],
    );
    expect(crop.rect.x).toBeCloseTo(10);
    expect(crop.rect.width).toBeCloseTo(46);
  });
  it("omits checkbox fragments clipped off a subsequent flow page", () => {
    expect(measure([{ x: -112, y: 12, width: 7, height: 7 }]).empty).toBe(true);
  });
});
