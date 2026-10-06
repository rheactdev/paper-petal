import { describe, expect, it, vi } from "vitest";
import { calendarMonth } from "../src/data/calendar";
import { newDocument } from "../src/data/templates";
import { normaliseDocument, pageMargins, syncPages } from "../src/data/model";
import { buildLetterLayout, cropPage } from "../src/data/print-layout";

const october = new Date(2026, 9, 4, 12);
const dates = (date: Date, template = "calendar", weekStart: 0 | 1 = 1) =>
  newDocument(template, { now: date, weekStart }).pages.flatMap((page) =>
    page.objects.filter((object) => object.label.endsWith(" date")),
  );

describe("monthly bullet journal calendars", () => {
  it("creates the browser's current month at creation time rather than a fixed example", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(october);
      expect(newDocument("calendar").title).toBe(
        "October 2026 · monthly calendar",
      );
      vi.setSystemTime(new Date(2027, 0, 1, 12));
      expect(newDocument("calendar-spread").title).toBe(
        "January 2027 · calendar spread",
      );
    } finally {
      vi.useRealTimers();
    }
  });
  it("places October 2026 dates on their correct Monday-start weekdays", () => {
    const month = calendarMonth(october);
    expect(month.weekdays).toEqual([
      "MON",
      "TUE",
      "WED",
      "THU",
      "FRI",
      "SAT",
      "SUN",
    ]);
    expect(month.weeks[0]).toEqual([null, null, null, 1, 2, 3, 4]);
    expect(month.weeks[4]).toEqual([26, 27, 28, 29, 30, 31, null]);
    expect(month.weeks).toHaveLength(5);
  });
  it("supports Sunday-start weeks and preserves every date", () => {
    const month = calendarMonth(october, 0);
    expect(month.weekdays).toEqual([
      "SUN",
      "MON",
      "TUE",
      "WED",
      "THU",
      "FRI",
      "SAT",
    ]);
    expect(month.weeks[0]).toEqual([null, null, null, null, 1, 2, 3]);
    expect(month.weeks.flat().filter((day) => day !== null)).toEqual(
      Array.from({ length: 31 }, (_, i) => i + 1),
    );
  });
  it("handles four- and six-week months, leap years and year boundaries", () => {
    expect(calendarMonth(new Date(2021, 1, 15, 12)).weeks).toHaveLength(4);
    expect(calendarMonth(new Date(2026, 7, 15, 12)).weeks).toHaveLength(6);
    expect(dates(new Date(2024, 1, 15, 12))).toHaveLength(29);
    expect(dates(new Date(2100, 1, 15, 12))).toHaveLength(28);
    expect(calendarMonth(new Date(2026, 11, 31, 12)).title).toBe(
      "December 2026",
    );
    expect(calendarMonth(new Date(2027, 0, 1, 12)).title).toBe("January 2027");
    expect(() => calendarMonth(new Date(NaN))).toThrow("valid calendar month");
  });
  it("builds a complete one-page calendar with editable entries and protected grid rules", () => {
    const doc = newDocument("calendar", { now: october });
    expect(doc.pages).toHaveLength(1);
    expect(normaliseDocument(doc)).toEqual(doc);
    const objects = doc.pages[0].objects;
    expect(dates(october).map((object) => Number(object.text))).toEqual(
      Array.from({ length: 31 }, (_, i) => i + 1),
    );
    expect(
      objects.filter((object) => object.label.endsWith(" entry")),
    ).toHaveLength(31);
    expect(
      objects
        .filter((object) => object.type === "text")
        .every((object) => !object.locked),
    ).toBe(true);
    expect(
      objects
        .filter((object) => object.type === "shape")
        .every((object) => object.locked),
    ).toBe(true);
    expect(objects.some((object) => object.label === "Monthly notes")).toBe(
      true,
    );
  });
  it("splits the same month across facing pages in chronological columns with weekly notes", () => {
    const doc = newDocument("calendar-spread", { now: october });
    expect(doc.pages).toHaveLength(2);
    expect(normaliseDocument(doc)).toEqual(doc);
    const headers = doc.pages.map((page) =>
      page.objects
        .filter((object) => object.label.endsWith("column heading"))
        .map((object) => object.text),
    );
    expect(headers).toEqual([
      ["MON", "TUE", "WED", "THU"],
      ["FRI", "SAT", "SUN", "NOTES"],
    ]);
    expect(
      doc.pages[0].objects.find((object) => object.label === "2026-10-01 date")
        ?.text,
    ).toBe("1");
    expect(
      doc.pages[1].objects.find((object) => object.label === "2026-10-04 date")
        ?.text,
    ).toBe("4");
    expect(
      doc.pages[1].objects.filter((object) =>
        /^Week \d+ notes$/.test(object.label),
      ),
    ).toHaveLength(5);
    expect(
      dates(october, "calendar-spread")
        .map((object) => Number(object.text))
        .sort((a, b) => a - b),
    ).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
    expect(syncPages(doc.pages, 1).map((page) => page.id)).toEqual(
      doc.pages.map((page) => page.id),
    );
  });
  it("gives each date exactly one entry on the correct week row across all month shapes", () => {
    for (let month = 0; month < 12; month++) {
      for (const template of ["calendar", "calendar-spread"]) {
        for (const weekStart of [0, 1] as const) {
          const date = new Date(2026, month, 15, 12);
          const doc = newDocument(template, { now: date, weekStart });
          const objects = doc.pages.flatMap((page) => page.objects);
          const count = new Date(2026, month + 1, 0, 12).getDate();
          const days = objects.filter((object) =>
            object.label.endsWith(" date"),
          );
          expect(new Set(days.map((object) => object.text)).size).toBe(count);
          expect(days).toHaveLength(count);
          for (const day of days) {
            const entry = objects.find(
              (object) =>
                object.label === day.label.replace(/ date$/, " entry"),
            );
            expect(entry?.x).toBe(day.x);
            expect(entry?.y).toBe(day.y + 7);
            expect(entry!.height).toBeGreaterThan(0);
          }
        }
      }
    }
  });
  it("keeps all calendar geometry inside A5 margins and fitting on actual-size Letter sheets", () => {
    for (let month = 0; month < 12; month++) {
      for (const template of ["calendar", "calendar-spread"]) {
        const doc = newDocument(template, {
          now: new Date(2026, month, 15, 12),
        });
        const crops = doc.pages.map((page, index) => {
          const margins = pageMargins(doc, index);
          for (const object of page.objects) {
            expect(object.x).toBeGreaterThanOrEqual(margins.left);
            expect(object.y).toBeGreaterThanOrEqual(margins.top);
            expect(object.x + object.width).toBeLessThanOrEqual(
              doc.paper.width - margins.right + 0.0001,
            );
            expect(object.y + object.height).toBeLessThanOrEqual(
              doc.paper.height - margins.bottom + 0.0001,
            );
          }
          return cropPage(page.id, index, doc.paper, page.objects);
        });
        expect(buildLetterLayout(doc.paper, crops).errors).toEqual([]);
      }
    }
  });
  it("retains calendar entries and unique identifiers in document backups", () => {
    const doc = newDocument("calendar-spread", { now: october });
    const entry = doc.pages[1].objects.find(
      (object) => object.label === "2026-10-04 entry",
    )!;
    entry.text = "A slow Sunday";
    expect(normaliseDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
    const ids = doc.pages.flatMap((page) => [
      page.id,
      ...page.objects.map((object) => object.id),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
