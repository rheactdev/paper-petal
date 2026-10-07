import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  HEADER_SPACE,
  headerDate,
  headerSchema,
  todayDate,
} from "../src/data/header";
import {
  MM,
  createObject,
  normaliseDocument,
  objectWarnings,
} from "../src/data/model";
import { newDocument } from "../src/data/templates";
import { flowStyle } from "../src/components/paper/flow";
import { PageHeader } from "../src/components/paper/page-header";
import { measurePageCrops } from "../src/components/paper/print-measurement.client";
vi.mock("@tanstack/react-start/client-only", () => ({}));

const weather = {
  city: "Tokyo, Japan",
  temperature: 20.4,
  unit: "celsius" as const,
  code: 2,
  isDay: true,
  observedAt: "2026-10-07T10:15:00.000Z",
};
describe("daily document headers", () => {
  it("captures the browser-local calendar date and formats a stable weekday independently of timezone", () => {
    expect(todayDate(new Date(2026, 9, 7, 23, 59))).toBe("2026-10-07");
    expect(headerDate("2026-10-07")).toEqual({
      date: "7 October 2026",
      day: "Wednesday",
    });
    expect(headerDate("2024-02-29").day).toBe("Thursday");
    expect(headerDate("2026-12-31").date).toBe("31 December 2026");
    expect(headerDate("2026-10-07", true)).toEqual({
      date: "7 Oct 2026",
      day: "Wed",
    });
  });
  it("rejects invalid dates and malformed weather snapshots without requiring migration of legacy documents", () => {
    for (const date of ["2026-02-29", "2026-02-30", "2026-13-01", "bad"])
      expect(headerSchema.safeParse({ date }).success).toBe(false);
    for (const invalid of [
      { ...weather, temperature: null },
      { ...weather, unit: "kelvin" },
      { ...weather, code: 100 },
      { ...weather, observedAt: "today" },
      { ...weather, apiKey: "private" },
    ]) {
      expect(
        headerSchema.safeParse({ date: "2026-10-07", weather: invalid })
          .success,
      ).toBe(false);
    }
    const doc = newDocument("blank");
    expect(normaliseDocument(doc)).toEqual(doc);
    doc.header = { date: "2026-10-07", weather };
    expect(normaliseDocument(JSON.parse(JSON.stringify(doc))).header).toEqual(
      doc.header,
    );
  });
  it("reserves the same header strip in flow columns and restores it on removal", () => {
    const doc = newDocument("blank"),
      before = flowStyle(doc);
    doc.header = { date: "2026-10-07", weather };
    expect(before.height - flowStyle(doc).height).toBeCloseTo(
      HEADER_SPACE * MM,
    );
    expect(flowStyle(doc).width).toBe(before.width);
    doc.paper.height = 60;
    doc.paper.margins.top = 14;
    doc.paper.margins.bottom = 14;
    expect(() => normaliseDocument(doc)).toThrow(/header.*writing space/);
    delete doc.header;
    expect(() => normaliseDocument(doc)).not.toThrow();
    doc.header = { date: "2026-10-07" };
    doc.paper.margins.top = 4;
    doc.paper.margins.bottom = 4;
    doc.paper.width = 60;
    expect(() => normaliseDocument(doc)).toThrow(/header needs at least 40 mm/);
    doc.paper.margins.inner = 10;
    doc.paper.margins.outer = 10;
    expect(() => normaliseDocument(doc)).not.toThrow();
  });
  it("renders saved weather and mirrored margins on every page without requesting fresh weather", () => {
    const doc = newDocument("blank");
    doc.header = { date: "2026-10-07", weather };
    doc.paper.margins.inner = 18;
    const first = renderToStaticMarkup(
      createElement(PageHeader, { doc, index: 0 }),
    );
    const second = renderToStaticMarkup(
      createElement(PageHeader, { doc, index: 1 }),
    );
    expect(first).toContain("Wednesday");
    expect(first).toContain("7 October 2026");
    expect(first).toContain("Partly cloudy · 20°C");
    expect(second).toContain("Tokyo, Japan");
    expect(first).toContain(`left:${18 * MM}px`);
    expect(second).toContain(`left:${12 * MM}px`);
    delete doc.header;
    expect(
      renderToStaticMarkup(createElement(PageHeader, { doc, index: 0 })),
    ).toBe("");
  });
  it("includes header-only pages in Letter crops and flags rotated decorations overlapping the header", () => {
    const doc = newDocument("blank");
    doc.header = { date: "2026-10-07" };
    const pageRect = { left: 0, top: 0, width: 148 * MM, height: 210 * MM };
    const header = {
      getBoundingClientRect: () => ({
        left: 12 * MM,
        top: 12 * MM,
        width: 124 * MM,
        height: 16 * MM,
      }),
    };
    const element = {
      getBoundingClientRect: () => pageRect,
      querySelector: (selector: string) =>
        selector === ".page-header" ? header : null,
      querySelectorAll: () => [],
    };
    const crops = measurePageCrops(
      { querySelector: () => element } as unknown as HTMLElement,
      doc,
    );
    expect(crops[0].empty).toBe(false);
    expect(crops[0].rect.x).toBeCloseTo(10);
    expect(crops[0].rect.y).toBeCloseTo(10);
    expect(crops[0].rect.width).toBeCloseTo(128);
    expect(crops[0].rect.height).toBeCloseTo(20);
    const object = createObject("shape", {
      x: 20,
      y: 13,
      width: 10,
      height: 10,
      rotation: 30,
    });
    expect(objectWarnings(doc, 0, object)).toContain("May overlap the header");
    object.y = 60;
    expect(objectWarnings(doc, 0, object)).not.toContain(
      "May overlap the header",
    );
  });
});
