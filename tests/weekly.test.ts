import { describe, expect, it, vi } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import { calendarSearch, weekRequest } from "../src/calendar/model";
import type { CalendarEvent } from "../src/calendar/model";
import {
  currentWeek,
  formatCalendarHour,
  formatCalendarTime,
  eventsOnDate,
  mondayOf,
  newWeeklyDocument,
  sampleWeek,
  timedSegments,
  halfHourInterval,
  halfHourSegments,
  weekBounds,
  weekDates,
  weeklyThemes,
  weeklyHourRange,
  weeklyStyleSchema,
  weeklyPageLayout,
  WEEKLY_COLUMN_WIDTH_MM,
  type WeeklyOptions,
} from "../src/data/weekly";
import { normaliseDocument, pageMargins, syncPages } from "../src/data/model";
import { buildLetterLayout, cropPage } from "../src/data/print-layout";

const options: WeeklyOptions = {
  week: "2026-10-05",
  timeZone: "America/New_York",
  theme: "botanical",
  privateTitles: false,
  locations: false,
  eventKey: true,
};
const timed = (id: string, start: string, end: string): CalendarEvent => ({
  id,
  calendarId: "work",
  calendarName: "Work",
  title: id,
  location: "",
  allDay: false,
  start,
  end,
});
const allDay: CalendarEvent = {
  ...timed("Away", "2026-10-04", "2026-10-07"),
  allDay: true,
};
const objectText = (result: ReturnType<typeof newWeeklyDocument>) =>
  result.document.pages
    .flatMap((p) => p.objects)
    .map((o) => o.text)
    .join("\n");

describe("calendar week validation and time zones", () => {
  it.each([
    [481, 554, 480, 540],
    [494.99, 584.99, 480, 570],
    [495, 585, 510, 600],
    [496, 586, 510, 600],
    [511, 516, 510, 540],
    [525, 526, 540, 570],
    [0, 5, 0, 30],
    [1425, 1435, 1410, 1440],
    [1439.99, 1440, 1410, 1440],
  ])(
    "rounds %s–%s to %s–%s without losing short or late events",
    (start, end, roundedStart, roundedEnd) => {
      expect(halfHourInterval(start, end)).toEqual({
        start: roundedStart,
        end: roundedEnd,
      });
    },
  );
  it("recalculates lanes for rounded collisions while preserving exact segments and source events", () => {
    const events = [
      timed("First", "2026-10-05T08:01:00Z", "2026-10-05T08:06:00Z"),
      timed("Second", "2026-10-05T08:07:00Z", "2026-10-05T08:12:00Z"),
      timed("Later", "2026-10-05T08:45:00Z", "2026-10-05T09:00:00Z"),
    ];
    const exact = timedSegments(events, options.week, "UTC");
    const before = JSON.stringify({ events, exact });
    const rounded = halfHourSegments(exact);
    expect(
      rounded.map((segment) => [
        segment.start,
        segment.end,
        segment.lane,
        segment.lanes,
      ]),
    ).toEqual([
      [480, 510, 0, 2],
      [480, 510, 1, 2],
      [540, 570, 0, 1],
    ]);
    rounded.forEach((segment, index) => {
      expect(segment.originalStart).toBe(exact[index].start);
      expect(segment.originalEnd).toBe(exact[index].end);
      expect(segment.event).toBe(events[index]);
    });
    expect(JSON.stringify({ events, exact })).toBe(before);
  });
  it("keeps overnight and final-day segments on their original dates after rounding", () => {
    const events = [
      timed("Overnight", "2026-10-05T23:50:00Z", "2026-10-06T00:10:00Z"),
      timed("Last second", "2026-10-11T23:59:59Z", "2026-10-12T00:00:00Z"),
    ];
    const segments = halfHourSegments(
      timedSegments(events, options.week, "UTC"),
    );
    expect(segments.map(({ day, start, end }) => [day, start, end])).toEqual([
      [0, 1410, 1440],
      [1, 0, 30],
      [6, 1410, 1440],
    ]);
    expect(segments[0].continuesAfter).toBe(true);
    expect(segments[1].continuesBefore).toBe(true);
  });
  it("formats midnight, noon, afternoon and day-end labels in both clock styles", () => {
    for (const [minutes, twelve, twentyFour] of [
      [0, "12:00 AM", "00:00"],
      [30, "12:30 AM", "00:30"],
      [9 * 60 + 5, "9:05 AM", "09:05"],
      [12 * 60, "12:00 PM", "12:00"],
      [13 * 60 + 30, "1:30 PM", "13:30"],
      [23 * 60 + 59, "11:59 PM", "23:59"],
      [24 * 60, "12:00 AM", "24:00"],
    ] as const) {
      expect(formatCalendarTime(minutes, "12h")).toBe(twelve);
      expect(formatCalendarTime(minutes, "24h")).toBe(twentyFour);
    }
    expect(formatCalendarHour(0, "12h")).toBe("12");
    expect(formatCalendarHour(12, "12h")).toBe("12");
    expect(formatCalendarHour(13, "12h")).toBe("1");
    expect(formatCalendarHour(24, "12h")).toBe("12");
    expect(formatCalendarHour(13, "24h")).toBe("13");
    expect(formatCalendarHour(6, "24h")).toBe("6");
    expect(formatCalendarHour(0, "24h")).toBe("0");
    for (let hour = 0; hour <= 24; hour++) {
      expect(formatCalendarHour(hour, "12h")).toBe(String(hour % 12 || 12));
      expect(formatCalendarHour(hour, "24h")).toBe(String(hour));
    }
  });
  it("validates real dates, time zones, calendar limits and strips unknown query fields", () => {
    expect(
      calendarSearch.parse({
        week: "2026-02-30",
        connection: "evil",
        access_token: "secret",
      }),
    ).toEqual({ week: undefined, connection: undefined });
    expect(
      weekRequest.safeParse({ ...options, calendarIds: ["work"] }).success,
    ).toBe(true);
    expect(
      weekRequest.parse({ ...options, calendarIds: ["work", "work"] })
        .calendarIds,
    ).toEqual(["work"]);
    for (const change of [
      { week: "2026-02-30" },
      { timeZone: "Nowhere/Else" },
      { calendarIds: [] },
      { calendarIds: Array(11).fill("work") },
    ]) {
      expect(
        weekRequest.safeParse({ ...options, calendarIds: ["work"], ...change })
          .success,
      ).toBe(false);
    }
  });
  it("uses Monday weeks across month and year boundaries and the browser-local date", () => {
    expect(mondayOf("2027-01-01")).toBe("2026-12-28");
    expect(weekDates("2027-01-01")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-05T01:00:00Z"));
      expect(currentWeek("America/New_York")).toBe("2026-09-28");
      expect(currentWeek("Asia/Tokyo")).toBe("2026-10-05");
    } finally {
      vi.useRealTimers();
    }
  });
  it("queries midnight boundaries with the correct offsets across daylight-saving changes", () => {
    expect(weekBounds("2026-03-02", "America/New_York")).toEqual({
      start: "2026-03-02T05:00:00Z",
      end: "2026-03-09T04:00:00Z",
    });
    expect(weekBounds("2026-10-26", "America/New_York")).toEqual({
      start: "2026-10-26T04:00:00Z",
      end: "2026-11-02T05:00:00Z",
    });
  });
  it("keeps all-day end dates exclusive, independent of timezone offsets", () => {
    expect(eventsOnDate([allDay], "2026-10-04")).toEqual([allDay]);
    expect(eventsOnDate([allDay], "2026-10-06")).toEqual([allDay]);
    expect(eventsOnDate([allDay], "2026-10-07")).toEqual([]);
    expect(timedSegments([allDay], options.week, options.timeZone)).toEqual([]);
  });
  it("splits midnight-spanning events, clips the week and retains local start/end times", () => {
    const events = [
      timed(
        "Overnight",
        "2026-10-05T23:00:00-04:00",
        "2026-10-06T02:00:00-04:00",
      ),
      timed(
        "Incoming",
        "2026-10-04T22:00:00-04:00",
        "2026-10-05T01:00:00-04:00",
      ),
      timed("Out", "2026-10-12T00:00:00-04:00", "2026-10-12T01:00:00-04:00"),
    ];
    const parts = timedSegments(events, options.week, options.timeZone);
    expect(parts).toHaveLength(3);
    expect(
      parts
        .filter((s) => s.event.id === "Overnight")
        .map((s) => [
          s.day,
          s.start,
          s.end,
          s.continuesBefore,
          s.continuesAfter,
        ]),
    ).toEqual([
      [0, 1380, 1440, false, true],
      [1, 0, 120, true, false],
    ]);
    expect(parts.find((s) => s.event.id === "Incoming")).toMatchObject({
      day: 0,
      start: 0,
      end: 60,
      continuesBefore: true,
    });
    const tokyo = timedSegments([events[0]], options.week, "Asia/Tokyo");
    expect(tokyo[0]).toMatchObject({ day: 1, start: 720, end: 900 });
  });
  it("assigns non-overlapping lanes, reuses released lanes and separates disconnected groups", () => {
    const events = [
      timed("A", "2026-10-05T09:00:00Z", "2026-10-05T12:00:00Z"),
      timed("B", "2026-10-05T10:00:00Z", "2026-10-05T11:00:00Z"),
      timed("C", "2026-10-05T11:00:00Z", "2026-10-05T13:00:00Z"),
      timed("D", "2026-10-05T14:00:00Z", "2026-10-05T15:00:00Z"),
    ];
    const segments = timedSegments(events, options.week, "UTC");
    expect(segments.map((s) => [s.event.id, s.lane, s.lanes])).toEqual([
      ["A", 0, 2],
      ["B", 1, 2],
      ["C", 1, 2],
      ["D", 0, 1],
    ]);
  });
  it("doesn't drop an event spanning the repeated autumn hour", () => {
    const events = [
      timed("Repeat", "2026-11-01T01:45:00-04:00", "2026-11-01T01:15:00-05:00"),
    ];
    const [segment] = timedSegments(events, "2026-10-26", options.timeZone);
    expect(segment.day).toBe(6);
    expect(segment.end).toBeGreaterThan(segment.start);
    const result = newWeeklyDocument(events, {
      ...options,
      week: "2026-10-26",
    });
    expect(result.eventCount).toBe(1);
    expect(result.needsKey).toBe(true);
    expect(objectText(result)).toContain("2026-11-01 01:45");
  });
});
describe("editable weekly spreads", () => {
  it.each([
    ["2024-02-26", 29, 4],
    ["2026-12-28", 31, 4],
    ["2027-03-01", 31, 7],
  ] as const)(
    "keeps the mini month accurate for %s, including leap days and year boundaries",
    (week, dayCount, highlighted) => {
      const doc = newWeeklyDocument([], { ...options, week }).document;
      const left = doc.pages[0].objects;
      const miniDates = left.filter((object) =>
        object.label.startsWith("Mini month date "),
      );
      expect(miniDates).toHaveLength(dayCount);
      expect(new Set(miniDates.map((object) => object.text)).size).toBe(
        dayCount,
      );
      const selected = left.filter((object) =>
        object.label.startsWith("Mini month current week "),
      );
      expect(selected).toHaveLength(highlighted);
      const weekSet = new Set(weekDates(week));
      expect(
        selected.every((object) => weekSet.has(object.label.slice(-10))),
      ).toBe(true);
      const firstHour = left.find((object) =>
        /Hour \d+ label$/.test(object.label),
      )!;
      for (const object of left.filter((object) =>
        /^(Mini month|Weekly notes)/.test(object.label),
      ))
        expect(object.x + object.width).toBeLessThan(firstHour.x);
      expect(
        left.find((object) => object.label === "Weekly notes"),
      ).toMatchObject({ type: "text", text: "", locked: false });
    },
  );
  it("puts dates inside bordered columns, removes the redundant heading and extends the timeline in every palette", () => {
    for (const theme of ["botanical", "rose", "mono"] as const) {
      const result = newWeeklyDocument([allDay], { ...options, theme });
      for (const [pageIndex, page] of result.document.pages.entries()) {
        expect(
          page.objects.some((object) =>
            [
              "Month heading",
              "Week and time zone",
              "Month, week and time zone",
            ].includes(object.label),
          ),
        ).toBe(false);
        const { days, gridX, columnWidth } = weeklyPageLayout(
          pageIndex as 0 | 1,
        );
        const headerTop = page.objects.find(
          (object) => object.label === "Day header top rule",
        )!;
        const headerBottom = page.objects.find(
          (object) => object.label === "Day header bottom rule",
        )!;
        expect(headerTop.y).toBe(12);
        expect(headerBottom.y).toBe(22);
        days.forEach((day, column) => {
          const date = weekDates(options.week)[day];
          const numeral = page.objects.find(
            (object) => object.label === `${date} date`,
          )!;
          const weekday = page.objects.find(
            (object) => object.label === `${date} day heading`,
          )!;
          const divider = page.objects.find(
            (object) => object.label === `${date} date divider`,
          )!;
          expect(numeral.text).toBe(String(day + 5));
          expect(numeral.font).toBe("Lora");
          expect(numeral.fontSize).toBe(17);
          expect(numeral.x).toBeGreaterThan(gridX + column * columnWidth);
          expect(numeral.x + numeral.width).toBeLessThan(divider.x);
          expect(divider.x + divider.width).toBeLessThan(weekday.x);
          for (const label of [numeral, weekday]) {
            expect(label.y).toBeGreaterThan(headerTop.y);
            expect(label.y + label.height).toBeLessThan(headerBottom.y);
            expect(label.x + label.width).toBeLessThan(
              gridX + (column + 1) * columnWidth,
            );
          }
        });
        const horizontal = page.objects.filter((object) =>
          /Hour \d+ (half-hour )?rule$|all-day divider|Day header .* rule/.test(
            object.label,
          ),
        );
        expect(horizontal.length).toBeGreaterThan(10);
        expect(new Set(horizontal.map((object) => object.fill))).toEqual(
          new Set([weeklyThemes[theme].grid]),
        );
        expect(new Set(horizontal.map((object) => object.height))).toEqual(
          new Set([0.15]),
        );
      }
      const plain = newWeeklyDocument([], { ...options, theme }).document;
      const firstRule = plain.pages[0].objects.find(
        (object) => object.label === "Hour 8 rule",
      )!;
      expect(firstRule.y).toBe(22);
      expect(195 - firstRule.y).toBeGreaterThan(164);
    }
  });
  it.each(["America/New_York", "America/Argentina/ComodRivadavia", "UTC"])(
    "keeps the complete %s time zone in the notes sidebar without overlapping the notes",
    (timeZone) => {
      const doc = newWeeklyDocument([], { ...options, timeZone }).document;
      const zone = doc.pages[0].objects.find(
        (object) => object.label === "Calendar time zone",
      )!;
      const heading = doc.pages[0].objects.find(
        (object) => object.label === "Weekly notes heading",
      )!;
      const firstColumn = doc.pages[0].objects.find(
        (object) => object.label === "Day column rule 0",
      )!;
      expect(zone.text.replaceAll("\n", "")).toBe(timeZone);
      expect(zone.x + zone.width).toBeLessThan(firstColumn.x - 5);
      expect(zone.y + zone.height).toBeLessThan(heading.y);
      expect(zone.height).toBeGreaterThan(
        zone.text.split("\n").length * zone.fontSize * 0.3528 * zone.lineHeight,
      );
      expect(
        doc.pages[1].objects.some(
          (object) => object.label === "Calendar time zone",
        ),
      ).toBe(false);
    },
  );
  it("places dated high/low estimates beside each day without shifting the timeline and keeps them in backups and Letter crops", () => {
    const plain = newWeeklyDocument([], options).document;
    const weather = {
      city: "Example city",
      unit: "celsius" as const,
      timeZone: options.timeZone,
      fetchedAt: "2026-10-05T12:00:00Z",
      days: weekDates(options.week)
        .slice(0, 6)
        .map((date, index) => ({
          date,
          high: 21.4 - index,
          low: 10.2 - index,
          code: 2,
        })),
    };
    const doc = newWeeklyDocument([], { ...options, weather }).document;
    const estimates = doc.pages.flatMap((page) =>
      page.objects.filter((object) =>
        object.label.includes("weather estimate"),
      ),
    );
    expect(estimates).toHaveLength(7);
    expect(estimates[0].text).toBe("21°/10°C");
    expect(estimates[6].text).toBe("—");
    const icons = doc.pages.flatMap((page) =>
      page.objects.filter((object) => object.label.includes("weather icon")),
    );
    expect(icons).toHaveLength(6);
    expect(
      icons.every(
        (object) => object.type === "sticker" && object.sticker === "cloud-sun",
      ),
    ).toBe(true);
    for (const [index, page] of doc.pages.entries()) {
      for (const object of page.objects.filter((object) =>
        object.label.includes("weather estimate"),
      )) {
        const day = page.objects.find(
          (heading) =>
            heading.label === `${object.label.slice(0, 10)} day heading`,
        )!;
        expect(object.y).toBeGreaterThan(day.y + day.height);
        expect(object.y + object.height).toBeLessThan(22);
        expect(object.textAlign).toBe("right");
        const icon = icons.find((icon) =>
          icon.label.startsWith(object.label.slice(0, 10)),
        );
        if (icon) {
          expect(icon.x).toBeGreaterThan(day.x);
          expect(icon.x + icon.width).toBeLessThan(object.x);
          expect(icon.y).toBeGreaterThan(day.y + day.height);
          expect(
            Math.abs(
              icon.y +
                icon.height / 2 -
                (object.y + (object.fontSize * 0.3528 * object.lineHeight) / 2),
            ),
          ).toBeLessThan(0.05);
        }
        const crop = cropPage(page.id, index, doc.paper, page.objects).rect;
        expect(crop.x).toBeLessThanOrEqual(object.x);
        expect(crop.x + crop.width).toBeGreaterThanOrEqual(
          object.x + object.width,
        );
      }
      const rules = (page: (typeof doc.pages)[number]) =>
        page.objects
          .filter((object) => /^Hour \d+ rule$/.test(object.label))
          .map(({ x, y, width, height }) => ({ x, y, width, height }));
      expect(rules(page)).toEqual(rules(plain.pages[index]));
    }
    expect(normaliseDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });
  it("reserves one-line day labels and right-aligns mixed Fahrenheit weather groups on both spread pages", () => {
    const measureLabels = (text: string, size: number) =>
      text.length * size * 0.3528 * 0.5;
    const weather = {
      city: "Example city",
      unit: "fahrenheit" as const,
      timeZone: options.timeZone,
      fetchedAt: "2026-10-05T12:00:00Z",
      days: weekDates(options.week).map((date, index) => ({
        date,
        high: [72, 65, 100, 8, -14, 0, 105][index],
        low: [57, 46, 80, -5, -22, -10, 91][index],
        code: index === 0 ? 3 : 0,
      })),
    };
    const doc = newWeeklyDocument([], {
      ...options,
      weather,
      measureLabels,
    }).document;
    for (const [pageIndex, page] of doc.pages.entries()) {
      const days = page.objects.filter((object) =>
        object.label.endsWith("day heading"),
      );
      const { columnWidth: width, gridX } = weeklyPageLayout(
        pageIndex as 0 | 1,
      );
      days.forEach((day, index) => {
        const date = day.label.slice(0, 10);
        const temperature = page.objects.find((object) =>
          object.label.startsWith(`${date} weather estimate`),
        )!;
        const icon = page.objects.find((object) =>
          object.label.startsWith(`${date} weather icon`),
        )!;
        expect(day.width).toBeGreaterThan(
          measureLabels(day.text, day.fontSize),
        );
        expect(day.y + day.height).toBeLessThan(icon.y);
        expect(icon.x + icon.width).toBeLessThan(temperature.x);
        expect(temperature.width).toBeGreaterThan(
          measureLabels(temperature.text, temperature.fontSize),
        );
        expect(temperature.x + temperature.width).toBeCloseTo(
          gridX + (index + 1) * width - 1.3,
        );
        expect(icon.y + icon.height).toBeLessThan(22);
      });
    }
  });
  it("creates seven equal 1.25-inch day columns on A5 with hours inside every column and a notes sidebar", () => {
    const result = newWeeklyDocument([], options);
    expect(result.document.pages).toHaveLength(2);
    expect(result.document.paper).toMatchObject({ width: 148, height: 210 });
    expect(result.document.title).toBe("A little week · 2026-10-05");
    expect(
      result.document.pages.map((p) =>
        p.objects
          .filter((o) => o.label.endsWith("day heading"))
          .map((o) => o.text),
      ),
    ).toEqual([
      ["MON", "TUE", "WED"],
      ["THU", "FRI", "SAT", "SUN"],
    ]);
    expect(WEEKLY_COLUMN_WIDTH_MM / 25.4).toBe(1.25);
    for (const [index, page] of result.document.pages.entries()) {
      expect(
        page.objects.filter((o) => /Hour \d+ label$/.test(o.label)),
      ).toHaveLength((index === 0 ? 3 : 4) * 12);
      const rules = page.objects.filter((o) =>
        /^Day column rule/.test(o.label),
      );
      expect(rules).toHaveLength(index === 0 ? 4 : 5);
      for (let column = 1; column < rules.length; column++)
        expect(rules[column].x - rules[column - 1].x).toBeCloseTo(31.75);
      const row = page.objects.find((o) => /^Hour \d+ rule/.test(o.label))!;
      expect(row.width).toBeCloseTo((index === 0 ? 3 : 4) * 31.75 + 0.15);
      expect(page.objects.some((o) => o.label === "Month heading")).toBe(false);
      expect(
        page.objects.filter((o) => o.type === "shape").every((o) => o.locked),
      ).toBe(true);
    }
    expect(result.hourRange).toEqual({ start: 8, end: 20 });
    expect(
      result.document.pages
        .flatMap((p) => p.objects)
        .some((o) =>
          /Weekly footer|intentions|Small joys|botanical detail/.test(o.label),
        ),
    ).toBe(false);
    expect(
      result.document.pages[0].objects.find(
        (o) => o.label === "2026-10-05 date",
      )?.fontSize,
    ).toBe(17);
    expect(
      result.document.pages[0].objects.find(
        (o) => o.label === "2026-10-05 day heading",
      )?.width,
    ).toBeCloseTo(31.75 - 13.3);
    expect(
      result.document.pages[0].objects.some((o) => o.label === "Weekly notes"),
    ).toBe(true);
    expect(
      result.document.pages[1].objects.some(
        (o) =>
          o.label.startsWith("Mini month") ||
          o.label.startsWith("Weekly notes"),
      ),
    ).toBe(false);
    expect(
      result.document.pages[0].objects.some((o) =>
        o.label.endsWith("all-day band"),
      ),
    ).toBe(false);
  });
  it.each([
    ["events", "12h"],
    ["events", "24h"],
    ["full", "12h"],
    ["full", "24h"],
  ] as const)(
    "centres every day's %s / %s hours inside their ruled rows and clear of timed artwork",
    (hours, timeFormat) => {
      const result = newWeeklyDocument(
        sampleWeek(options.week, options.timeZone),
        { ...options, hours, timeFormat },
      );
      const dates = weekDates(options.week);
      for (const [index, page] of result.document.pages.slice(0, 2).entries()) {
        const { days, gridX, columnWidth, hourGutter } = weeklyPageLayout(
          index as 0 | 1,
        );
        for (const [column, day] of days.entries()) {
          const left = gridX + column * columnWidth;
          const labels = page.objects.filter(
            (object) =>
              object.type === "text" &&
              object.label.startsWith(`${dates[day]} Hour `),
          );
          expect(labels.map((object) => object.text)).toEqual(
            Array.from(
              { length: result.hourRange.end - result.hourRange.start },
              (_, offset) =>
                formatCalendarHour(result.hourRange.start + offset, timeFormat),
            ),
          );
          for (const [labelIndex, label] of labels.entries()) {
            expect(label.x).toBeGreaterThan(left);
            expect(label.x + label.width).toBeLessThan(left + hourGutter);
            const hour = result.hourRange.start + labelIndex;
            const rule = page.objects.find(
              (object) => object.label === `Hour ${hour} rule`,
            )!;
            const halfHour = page.objects.find(
              (object) => object.label === `Hour ${hour} half-hour rule`,
            )!;
            expect(label.y + label.height / 2).toBeCloseTo(
              (rule.y + rule.height + halfHour.y) / 2,
            );
            expect(label.height).toBeCloseTo(
              (label.fontSize / 72) * 25.4 * label.lineHeight,
            );
            expect(label.y).toBeGreaterThan(rule.y + rule.height);
            expect(label.y + label.height).toBeLessThan(halfHour.y);
            expect(label.y).toBeGreaterThanOrEqual(
              result.document.paper.margins.top,
            );
            expect(label.y + label.height).toBeLessThanOrEqual(
              result.document.paper.height -
                result.document.paper.margins.bottom,
            );
            expect(label.fontSize).toBe(6);
            if (labelIndex)
              expect(
                labels[labelIndex - 1].y + labels[labelIndex - 1].height,
              ).toBeLessThan(label.y);
          }
          const artwork = page.objects.filter(
            (object) =>
              /^Event \d+ (label|duration arrow)/.test(object.label) &&
              object.x >= left &&
              object.x < left + columnWidth,
          );
          for (const object of artwork) {
            expect(object.x).toBeGreaterThan(left + hourGutter);
            expect(object.x + object.width).toBeLessThan(left + columnWidth);
          }
        }
        expect(
          page.objects.some((object) => /^Hour \d+ label$/.test(object.label)),
        ).toBe(false);
      }
    },
  );
  it("renders the sample on half-hour rules without requiring extra key pages", () => {
    const result = newWeeklyDocument(
      sampleWeek(options.week, options.timeZone),
      options,
    );
    expect(result.eventCount).toBe(7);
    expect(result.document.pages).toHaveLength(2);
    const work = result.document.pages[0].objects.find(
      (o) => o.shape === "arrow" && o.label.includes("focused work"),
    )!;
    expect(result.hourRange).toEqual({ start: 8, end: 21 });
    const top = result.document.pages[0].objects.find(
        (o) => o.label === "Hour 8 rule",
      )!.y,
      height = 195 - top;
    expect(work.y + work.height).toBeCloseTo(
      top + ((13 - 8) / 13) * height - 1,
    );
    const label = result.document.pages[0].objects.find(
      (o) => o.type === "text" && o.label.includes("focused work"),
    )!;
    expect(label.y).toBeCloseTo(top + ((10 - 8) / 13) * height);
    expect(work.y).toBeGreaterThan(label.y + label.height);
    expect(work.locked).toBe(false);
  });
  it.each(["events", "full"] as const)(
    "places off-grid starts on half-hour rules in %s mode and preserves original times",
    (hours) => {
      const events = [
        timed("Visit", "2026-10-05T08:12:00Z", "2026-10-05T10:13:00Z"),
        timed("Meeting", "2026-10-06T09:15:00Z", "2026-10-06T11:45:00Z"),
        timed("Night", "2026-10-07T23:59:59Z", "2026-10-08T00:00:00Z"),
        timed("Tea", "2026-10-08T00:01:00Z", "2026-10-08T00:09:00Z"),
      ];
      const before = JSON.stringify(events);
      const result = newWeeklyDocument(events, {
        ...options,
        timeZone: "UTC",
        hours,
      });
      for (const [index, start] of [480, 570, 1410, 0].entries()) {
        const page = result.document.pages[index < 3 ? 0 : 1];
        const objects = page.objects;
        const top = objects.find((object) =>
          /^Hour \d+ rule$/.test(object.label),
        )!.y;
        const halfRow =
          objects.find((object) => /half-hour rule$/.test(object.label))!.y -
          top;
        const label = objects.find((object) =>
          object.label.startsWith(`Event ${index + 1} label`),
        )!;
        expect(label.text).toBe(events[index].title);
        expect(label.y).toBeCloseTo(
          top + ((start - result.hourRange.start * 60) / 30) * halfRow,
        );
        expect((label.y - top) / halfRow).toBeCloseTo(
          Math.round((label.y - top) / halfRow),
        );
        expect(label.y + label.height).toBeLessThanOrEqual(195.001);
      }
      const visit = result.document.pages[0].objects.find((object) =>
        object.label.startsWith("Event 1 label"),
      )!;
      expect(visit.label).toContain("08:12–10:13");
      const arrow = result.document.pages[0].objects.find((object) =>
        object.label.startsWith("Event 1 duration arrow"),
      )!;
      const ten = result.document.pages[0].objects.find(
        (object) => object.label === "Hour 10 rule",
      )!;
      expect(arrow.y + arrow.height + 1).toBeCloseTo(ten.y);
      expect(JSON.stringify(events)).toBe(before);
      expect(
        normaliseDocument(JSON.parse(JSON.stringify(result.document))),
      ).toEqual(result.document);
    },
  );
  it("uses title-only appointments and duration arrows without background fills", () => {
    const names = [
      "Physiotherapy appointment",
      "Water plants",
      "Sketching appointment",
      "Hang out with Aunt Robin",
      "Play with Robin",
    ];
    const starts = ["08:00", "09:00", "10:00", "12:00", "14:30"],
      ends = ["09:00", "10:00", "12:00", "14:30", "15:00"];
    const events = names.map((title, i) => ({
      ...timed(
        `event-${i}`,
        `2026-10-05T${starts[i]}:00-04:00`,
        `2026-10-05T${ends[i]}:00-04:00`,
      ),
      title,
    }));
    const focused = newWeeklyDocument(events, options);
    expect(focused.hourRange).toEqual({ start: 7, end: 16 });
    expect(focused.needsKey).toBe(false);
    expect(focused.document.pages).toHaveLength(2);
    const labels = focused.document.pages[0].objects.filter((o) =>
      /^Event \d+ label/.test(o.label),
    );
    expect(labels).toHaveLength(events.length);
    labels.forEach((label, i) => {
      expect(label.text.replaceAll("\n", " ")).toBe(names[i]);
      expect(label.text).not.toContain("…");
      expect(label.text).not.toMatch(/^\d+ ·/);
      expect(label.fontSize).toBe(8.5);
      const lineHeight = label.fontSize * 0.3528 * label.lineHeight;
      const rowsPerLine = 173 / 18 / lineHeight;
      expect(rowsPerLine).toBeCloseTo(Math.round(rowsPerLine));
    });
    const objects = focused.document.pages[0].objects;
    events.forEach((_, i) => {
      const arrow = objects.find((o) =>
        o.label.startsWith(`Event ${i + 1} duration arrow`),
      )!;
      const label = labels[i];
      const end = Number(ends[i].slice(0, 2)) + Number(ends[i].slice(3)) / 60;
      const start =
        Number(starts[i].slice(0, 2)) + Number(starts[i].slice(3)) / 60;
      expect(label.y).toBeCloseTo(22 + ((start - 7) / 9) * 173);
      if ([0, 1, 4].includes(i)) {
        expect(arrow).toBeUndefined();
        return;
      }
      expect(arrow.shape).toBe("arrow");
      expect(arrow.y + arrow.height).toBeCloseTo(
        22 + ((end - 7) / 9) * 173 - 1,
      );
      expect(arrow.y).toBeGreaterThan(label.y);
      expect(arrow.width).toBe(2.5);
      expect(arrow.fill).toBe(weeklyThemes.mono.muted);
      expect(arrow.locked).toBe(false);
    });
    expect(objects.some((o) => /Event \d+ (block|divider)/.test(o.label))).toBe(
      false,
    );
    expect(
      focused.document.pages
        .flatMap((p) => p.objects)
        .some((o) => /weekend tint|all-day band/.test(o.label)),
    ).toBe(false);
    const full = newWeeklyDocument(events, { ...options, hours: "full" });
    expect(full.hourRange).toEqual({ start: 0, end: 24 });
    expect(
      full.document.pages[0].objects.filter((o) =>
        /Hour \d+ label$/.test(o.label),
      ),
    ).toHaveLength(72);
    expect(full.needsKey).toBe(false);
    expect(
      focused.document.pages[0].objects.some((o) =>
        o.label.startsWith("Event 3 duration arrow"),
      ),
    ).toBe(true);
    expect(
      full.document.pages[0].objects.some((o) =>
        o.label.startsWith("Event 1 duration arrow"),
      ),
    ).toBe(false);
  });
  it("keeps every timed segment in a common padded window, including midnight and sparse weeks", () => {
    const cases = [
      ["2026-10-05T23:59:59Z", "2026-10-06T00:00:00Z"],
      ["2026-10-05T00:05:00Z", "2026-10-05T00:20:00Z"],
      ["2026-10-05T23:30:00Z", "2026-10-06T00:20:00Z"],
      ["2026-10-05T10:15:00Z", "2026-10-05T10:30:00Z"],
      ["2026-10-11T23:30:00Z", "2026-10-12T02:00:00Z"],
    ];
    for (const [start, end] of cases) {
      const event = timed("Boundary", start, end);
      const segments = timedSegments([event], options.week, "UTC");
      const range = weeklyHourRange(segments);
      expect(range.start).toBeGreaterThanOrEqual(0);
      expect(range.end).toBeLessThanOrEqual(24);
      expect(range.end - range.start).toBeGreaterThanOrEqual(6);
      segments.forEach((s) => {
        expect(s.start).toBeGreaterThanOrEqual(range.start * 60);
        expect(s.end).toBeLessThanOrEqual(range.end * 60);
      });
      const result = newWeeklyDocument([event], {
        ...options,
        timeZone: "UTC",
      });
      const arrows = result.document.pages
        .slice(0, 2)
        .flatMap((p) => p.objects)
        .filter((o) => o.label.startsWith("Event 1 duration arrow"));
      const labels = result.document.pages
        .slice(0, 2)
        .flatMap((p) => p.objects)
        .filter((o) => /^Event 1 (label|key marker)/.test(o.label));
      expect(labels).toHaveLength(segments.length);
      for (const label of labels) {
        expect(label.y).toBeGreaterThanOrEqual(22);
        expect(label.y + label.height).toBeLessThanOrEqual(195.001);
      }
      const objects = result.document.pages[0].objects;
      const hourRule = objects.find((o) => /^Hour \d+ rule$/.test(o.label))!;
      const halfHourRule = objects.find((o) =>
        /half-hour rule$/.test(o.label),
      )!;
      for (const arrow of arrows)
        expect(arrow.height + 0.001).toBeGreaterThanOrEqual(
          2 * (halfHourRule.y - hourRule.y),
        );
    }
    expect(
      weeklyHourRange(
        timedSegments(
          [timed("Overnight", "2026-10-05T23:30:00Z", "2026-10-06T00:20:00Z")],
          options.week,
          "UTC",
        ),
      ),
    ).toEqual({ start: 0, end: 24 });
    expect(newWeeklyDocument([allDay], options).hourRange).toEqual({
      start: 8,
      end: 20,
    });
  });
  it("omits short overlapping arrows while keeping readable titles in separate lanes", () => {
    const events = [
      timed("A short call", "2026-10-05T09:00:00Z", "2026-10-05T09:30:00Z"),
      timed("Catch up", "2026-10-05T09:15:00Z", "2026-10-05T10:00:00Z"),
    ];
    const result = newWeeklyDocument(events, {
      ...options,
      timeZone: "UTC",
      hours: "full",
    });
    const objects = result.document.pages[0].objects;
    const arrows = objects.filter((o) => o.shape === "arrow");
    expect(arrows).toHaveLength(0);
    const labels = objects.filter((o) => /^Event \d+ label/.test(o.label));
    expect(labels.map((o) => o.text.replaceAll("\n", " "))).toEqual(
      events.map((e) => e.title),
    );
    expect(labels[0].y + labels[0].height).toBeLessThanOrEqual(
      labels[1].y + 0.001,
    );
    expect(labels[1].label).toContain("09:15–10:00");
    expect(result.needsKey).toBe(false);
  });
  it.each([true, false])(
    "shows short-event titles without arrows or number replacements (event key: %s)",
    (eventKey) => {
      const events = [
        timed("Tea", "2026-10-05T07:30:00Z", "2026-10-05T07:45:00Z"),
        timed("Appointment", "2026-10-05T08:00:00Z", "2026-10-05T09:00:00Z"),
        timed("Shower", "2026-10-06T07:30:00Z", "2026-10-06T07:45:00Z"),
        timed("Water plants", "2026-10-07T08:30:00Z", "2026-10-07T08:45:00Z"),
        timed("Evening", "2026-10-05T20:00:00Z", "2026-10-05T21:00:00Z"),
      ];
      const result = newWeeklyDocument(events, {
        ...options,
        timeZone: "UTC",
        eventKey,
      });
      const objects = result.document.pages
        .slice(0, 2)
        .flatMap((page) => page.objects);
      for (const name of ["Tea", "Shower", "Water plants"]) {
        const label = objects.find(
          (o) =>
            o.label.startsWith("Event ") &&
            o.label.includes(" label ·") &&
            o.label.endsWith(name),
        )!;
        const arrow = objects.find(
          (o) => o.label.includes("duration arrow") && o.label.endsWith(name),
        );
        expect(label).toBeDefined();
        expect(label.text.replaceAll("\n", " ")).toBe(name);
        expect(label.text).not.toMatch(/^\d/);
        expect(label.fontSize).toBe(8.5);
        expect(label.height).toBeGreaterThanOrEqual(
          label.fontSize * 0.3528 * label.lineHeight,
        );
        expect(arrow).toBeUndefined();
      }
      const tea = objects.find(
        (o) => o.label.includes(" label ·") && o.label.endsWith("Tea"),
      )!;
      const appointment = objects.find(
        (o) => o.label.includes(" label ·") && o.label.endsWith("Appointment"),
      )!;
      expect(tea.y + tea.height).toBeLessThanOrEqual(appointment.y);
    },
  );
  it("keeps full short-event titles without tiny arrows or unnecessary event-key pages", () => {
    const event = timed(
      "A little reminder with a long name",
      "2026-10-05T14:30:00Z",
      "2026-10-05T14:45:00Z",
    );
    const result = newWeeklyDocument([event], {
      ...options,
      timeZone: "UTC",
      hours: "full",
    });
    const objects = result.document.pages[0].objects;
    const label = objects.find((o) => o.label.startsWith("Event 1 label"))!;
    const arrow = objects.find((o) =>
      o.label.startsWith("Event 1 duration arrow"),
    )!;
    expect(label.text.replaceAll("\n", " ")).toBe(event.title);
    expect(label.text).not.toContain("1 ·");
    expect(arrow).toBeUndefined();
    expect(label.y).toBeCloseTo(22 + (14.5 / 24) * 173);
    expect(result.needsKey).toBe(false);
    expect(result.document.pages).toHaveLength(2);
    expect(label.label).toContain("14:30–14:45");
  });
  it("keeps extended short labels clear of consecutive entries and inside the last hour", () => {
    const events = [
      timed("Tea", "2026-10-05T08:00:00Z", "2026-10-05T08:05:00Z"),
      timed("Call", "2026-10-05T08:30:00Z", "2026-10-05T08:45:00Z"),
      timed("Journal", "2026-10-05T23:55:00Z", "2026-10-06T00:00:00Z"),
    ];
    for (const fontSize of [6, 8.5, 12, 24]) {
      const result = newWeeklyDocument(events, {
        ...options,
        timeZone: "UTC",
        fontSize,
      });
      const labels = result.document.pages[0].objects.filter((o) =>
        /Event \d+ label/.test(o.label),
      );
      for (const label of labels) {
        expect(label.y).toBeGreaterThanOrEqual(22);
        expect(label.y + label.height).toBeLessThanOrEqual(195.001);
        for (const other of labels) {
          if (label === other) continue;
          const overlapX =
            label.x < other.x + other.width && label.x + label.width > other.x;
          if (overlapX)
            expect(
              label.y + label.height <= other.y ||
                other.y + other.height <= label.y,
            ).toBe(true);
        }
      }
    }
  });
  it("places a rounded 07:45 event beside an 08:00 appointment while preserving original times", () => {
    for (const eventKey of [true, false]) {
      const result = newWeeklyDocument(
        [
          timed("Feed the cat", "2026-10-05T07:45:00Z", "2026-10-05T08:00:00Z"),
          timed("Appointment", "2026-10-05T08:00:00Z", "2026-10-05T09:00:00Z"),
          timed("Evening", "2026-10-05T20:00:00Z", "2026-10-05T21:00:00Z"),
        ],
        { ...options, timeZone: "UTC", eventKey },
      );
      const objects = result.document.pages[0].objects;
      const first = objects.find((o) => o.label.startsWith("Event 1 label"))!;
      const next = objects.find((o) => o.label.startsWith("Event 2 label"))!;
      expect(first).toBeDefined();
      expect(first.text.replaceAll("\n", " ")).toBe("Feed the cat");
      expect(first.y).toBe(next.y);
      expect(
        first.x + first.width < next.x || next.x + next.width < first.x,
      ).toBe(true);
      expect(first.label).toContain("07:45–08:00");
      expect(first.y).toBe(
        objects.find((object) => object.label === "Hour 8 rule")!.y,
      );
      expect(objects.some((o) => /key marker/.test(o.label))).toBe(false);
      expect(
        objects.some((o) => o.label.startsWith("Event 1 duration arrow")),
      ).toBe(false);
    }
  });
  it("keeps unplaceable crowded titles in the event key without number-only timeline markers", () => {
    const events = [
      timed("First note", "2026-10-05T07:00:00Z", "2026-10-05T07:10:00Z"),
      timed("Second note", "2026-10-05T07:10:00Z", "2026-10-05T07:20:00Z"),
      timed("Third note", "2026-10-05T07:20:00Z", "2026-10-05T08:00:00Z"),
    ];
    const result = newWeeklyDocument(events, {
      ...options,
      timeZone: "UTC",
      hours: "full",
    });
    const labels = result.document.pages[0].objects.filter((o) =>
      /^Event \d+ label/.test(o.label),
    );
    expect(
      result.document.pages[0].objects.some((o) => /key marker/.test(o.label)),
    ).toBe(false);
    for (const label of labels) {
      expect(label.text).not.toMatch(/^\d+$/);
      for (const other of labels)
        if (label !== other)
          expect(
            label.y + label.height <= other.y + 0.001 ||
              other.y + other.height <= label.y + 0.001 ||
              label.x + label.width <= other.x ||
              other.x + other.width <= label.x,
          ).toBe(true);
    }
    expect(result.needsKey).toBe(true);
    const details = objectText(result);
    for (const event of events) expect(details).toContain(event.title);
  });
  it("uses exactly two ruled rows as the arrow cutoff after title wrapping and end padding", () => {
    const events = [
      timed("Plan", "2026-10-05T09:00:00Z", "2026-10-05T11:00:00Z"),
    ];
    const settings = {
      ...options,
      timeZone: "UTC",
      hours: "full" as const,
      arrowPadding: 0,
    };
    const base = newWeeklyDocument(events, settings).document.pages[0].objects;
    const arrow = base.find((o) =>
      o.label.startsWith("Event 1 duration arrow"),
    )!;
    const hour = base.find((o) => o.label === "Hour 9 rule")!;
    const half = base.find((o) => o.label === "Hour 9 half-hour rule")!;
    const twoRows = 2 * (half.y - hour.y);
    const exactPadding = arrow.height - twoRows;
    expect(exactPadding).toBeGreaterThan(0);
    for (const [extraPadding, visible] of [
      [-0.01, true],
      [0, true],
      [0.01, false],
    ] as const) {
      const objects = newWeeklyDocument(events, {
        ...settings,
        arrowPadding: exactPadding + extraPadding,
      }).document.pages[0].objects;
      const result = objects.find((o) =>
        o.label.startsWith("Event 1 duration arrow"),
      );
      expect(Boolean(result)).toBe(visible);
      if (result) expect(result.height + 0.001).toBeGreaterThanOrEqual(twoRows);
    }
  });
  it.each([6, 8.5, 12, 24])(
    "measures minimum arrow length against the grid at %s pt",
    (fontSize) => {
      const result = newWeeklyDocument(
        [
          timed("Plan", "2026-10-05T09:00:00Z", "2026-10-05T13:00:00Z"),
          timed("Tea", "2026-10-06T09:00:00Z", "2026-10-06T09:15:00Z"),
        ],
        { ...options, timeZone: "UTC", fontSize },
      );
      const objects = result.document.pages[0].objects;
      const hour = objects.find((o) => o.label === "Hour 9 rule")!;
      const half = objects.find((o) => o.label === "Hour 9 half-hour rule")!;
      const arrows = objects.filter((o) => o.shape === "arrow");
      expect(arrows).toHaveLength(1);
      expect(arrows[0].label).toContain("Plan");
      expect(arrows[0].height + 0.001).toBeGreaterThanOrEqual(
        2 * (half.y - hour.y),
      );
    },
  );
  it("wraps long titles beyond two lines and beyond their duration when the next event is clear", () => {
    const title =
      "A long reminder to pack lunch, fill the water bottle, choose a notebook, and pick up the library books on the way home";
    const events = [
      timed(title, "2026-10-05T09:00:00Z", "2026-10-05T09:05:00Z"),
      timed("Next event", "2026-10-05T14:00:00Z", "2026-10-05T15:00:00Z"),
    ];
    const result = newWeeklyDocument(events, {
      ...options,
      timeZone: "UTC",
      hours: "full",
    });
    const objects = result.document.pages[0].objects;
    const label = objects.find((o) => o.label.startsWith("Event 1 label"))!;
    const next = objects.find((o) => o.label.startsWith("Event 2 label"))!;
    expect(label.text.split("\n").length).toBeGreaterThan(2);
    expect(label.text.replace(/\s+/g, " ")).toBe(title);
    expect(label.text).not.toContain("…");
    expect(label.y + label.height).toBeLessThan(next.y);
    expect(result.needsKey).toBe(false);
    expect(result.document.pages).toHaveLength(2);
    expect(
      objects.some((o) => o.label.startsWith("Event 1 duration arrow")),
    ).toBe(false);
  });
  it.each([
    ["events", false],
    ["events", true],
    ["full", false],
    ["full", true],
  ] as const)(
    "keeps three and longer wrapped lines clear of the ruling in %s mode, all-day band: %s",
    (hours, withAllDay) => {
      const titles = [
        "Desensitize Shane the Cat's back paws",
        "A long reminder to pack lunch, fill the water bottle and pick up the library books",
      ];
      const events = titles.map((title, index) => ({
        ...timed(
          `wrap-${index}`,
          `2026-10-0${5 + index}T08:00:00-04:00`,
          `2026-10-0${5 + index}T10:00:00-04:00`,
        ),
        title,
      }));
      events.push(
        timed(
          "Evening",
          "2026-10-05T20:00:00-04:00",
          "2026-10-05T21:00:00-04:00",
        ),
      );
      if (withAllDay) events.push(allDay);
      const doc = newWeeklyDocument(events, { ...options, hours }).document;
      const objects = doc.pages[0].objects;
      const firstRule = objects.find((object) =>
        /^Hour \d+ rule$/.test(object.label),
      )!;
      const halfRule = objects.find((object) =>
        /half-hour rule$/.test(object.label),
      )!;
      const rowHeight = halfRule.y - firstRule.y;
      for (const title of titles) {
        const label = objects.find(
          (object) =>
            /^Event \d+ label/.test(object.label) &&
            object.label.endsWith(title),
        )!;
        const lines = label.text.split("\n");
        expect(lines.length).toBeGreaterThanOrEqual(3);
        expect(lines.join(" ")).toBe(title);
        const fontHeight = label.fontSize * 0.3528;
        const step = fontHeight * label.lineHeight;
        for (let index = 0; index < lines.length; index++) {
          const inkTop = label.y + index * step + (step - fontHeight) / 2;
          const row = Math.floor((inkTop - firstRule.y) / rowHeight);
          const rowTop = firstRule.y + row * rowHeight;
          expect(inkTop).toBeGreaterThan(rowTop + firstRule.height);
          expect(inkTop + fontHeight).toBeLessThan(rowTop + rowHeight);
        }
        expect(label.height).toBeGreaterThanOrEqual(lines.length * step);
      }
      expect(normaliseDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
    },
  );
  it("truncates a wrapped title when it would collide with the next event and keeps the full title in the key", () => {
    const title =
      "A long reminder to pack lunch, fill the water bottle, choose a notebook, and pick up the library books on the way home";
    const result = newWeeklyDocument(
      [
        timed(title, "2026-10-05T09:00:00Z", "2026-10-05T09:05:00Z"),
        timed("Next event", "2026-10-05T10:00:00Z", "2026-10-05T11:00:00Z"),
      ],
      { ...options, timeZone: "UTC", hours: "full" },
    );
    const objects = result.document.pages[0].objects;
    const label = objects.find((o) => o.label.startsWith("Event 1 label"))!;
    const next = objects.find((o) => o.label.startsWith("Event 2 label"))!;
    expect(label.text).toContain("…");
    expect(label.y + label.height).toBeLessThan(next.y);
    expect(next.text).toBe("Next event");
    expect(result.needsKey).toBe(true);
    expect(
      result.document.pages
        .slice(2)
        .flatMap((p) => p.objects)
        .map((o) => o.text)
        .join("")
        .replaceAll("\n", ""),
    ).toContain(title);
  });
  it.each(["Elliot Letters Bold", "Minuet"] as const)(
    "wraps event labels using loaded %s metrics and stores the chosen font",
    (font) => {
      const event = timed(
        "A lovely afternoon with friends",
        "2026-10-05T12:00:00-04:00",
        "2026-10-05T13:00:00-04:00",
      );
      const measureText = vi.fn(
        (text: string, size: number) => [...text].length * size * 0.25,
      );
      const result = newWeeklyDocument([event, allDay], {
        ...options,
        font,
        measureText,
      });
      const labels = result.document.pages
        .flatMap((p) => p.objects)
        .filter((o) => /Event \d+ label|all-day ·/.test(o.label));
      expect(labels.length).toBeGreaterThan(1);
      expect(measureText).toHaveBeenCalled();
      for (const label of labels) {
        expect(label.font).toBe(font);
        for (const line of label.text.split("\n")) {
          expect(measureText(line, label.fontSize)).toBeLessThanOrEqual(
            label.width,
          );
        }
      }
      expect(result.document.typography.font).toBe(font);
      expect(
        normaliseDocument(JSON.parse(JSON.stringify(result.document))),
      ).toEqual(result.document);
    },
  );
  it("validates style settings and rejects invalid sizes, padding and directions", () => {
    expect(weeklyStyleSchema.parse({})).toEqual({
      fontSize: 8.5,
      arrowPosition: "center",
      arrowPadding: 1,
      textAlign: "left",
      timeFormat: "24h",
    });
    for (const fontSize of [5.9, 24.1, Infinity, NaN, "12"]) {
      expect(weeklyStyleSchema.safeParse({ fontSize }).success).toBe(false);
    }
    for (const arrowPadding of [-0.1, 10.1, Infinity, NaN, "2"]) {
      expect(weeklyStyleSchema.safeParse({ arrowPadding }).success).toBe(false);
    }
    for (const input of [{ arrowPosition: "auto" }, { textAlign: "justify" }]) {
      expect(weeklyStyleSchema.safeParse(input).success).toBe(false);
    }
    expect(weeklyStyleSchema.safeParse({ timeFormat: "12h" }).success).toBe(
      true,
    );
    expect(weeklyStyleSchema.safeParse({ timeFormat: "25h" }).success).toBe(
      false,
    );
  });
  it("uses bare 12-hour timeline labels and explicit AM/PM event-key times while preserving event positions and backups", () => {
    const event = timed(
      "A very long appointment title ".repeat(20),
      "2026-10-05T13:30:00-04:00",
      "2026-10-05T13:45:00-04:00",
    );
    const settings = { ...options, hours: "full" as const };
    const twelve = newWeeklyDocument([event], {
      ...settings,
      timeFormat: "12h",
    }).document;
    const twentyFour = newWeeklyDocument([event], {
      ...settings,
      timeFormat: "24h",
    }).document;
    expect(
      twelve.pages[0].objects.find((o) => o.label === "2026-10-05 Hour 0 label")
        ?.text,
    ).toBe("12");
    expect(
      twelve.pages[0].objects.find(
        (o) => o.label === "2026-10-05 Hour 12 label",
      )?.text,
    ).toBe("12");
    expect(
      twelve.pages[0].objects.find(
        (o) => o.label === "2026-10-05 Hour 13 label",
      )?.text,
    ).toBe("1");
    expect(
      twelve.pages[0].objects.find(
        (o) => o.label === "2026-10-05 Hour 23 label",
      )?.text,
    ).toBe("11");
    expect(
      twelve.pages[0].objects.some(
        (o) => o.label === "2026-10-05 Hour 24 label",
      ),
    ).toBe(false);
    const keyText = (doc: typeof twelve) =>
      doc.pages
        .slice(2)
        .flatMap((p) => p.objects)
        .map((o) => o.text)
        .join("")
        .replaceAll("\n", "");
    expect(keyText(twelve)).toContain("2026-10-05 1:30 PM");
    expect(keyText(twentyFour)).toContain("2026-10-05 13:30");
    const label = (doc: typeof twelve) =>
      doc.pages[0].objects.find((o) => o.label.startsWith("Event 1 label"))!;
    expect(label(twelve).label).toContain("1:30 PM–1:45 PM");
    expect(label(twentyFour).label).toContain("13:30–13:45");
    for (const property of [
      "x",
      "y",
      "width",
      "height",
      "text",
      "fontSize",
    ] as const)
      expect(label(twelve)[property]).toEqual(label(twentyFour)[property]);
    expect(normaliseDocument(JSON.parse(JSON.stringify(twelve)))).toEqual(
      twelve,
    );
  });
  it("applies font size and alignment to event titles while keeping headings and timeline labels unchanged", () => {
    for (const fontSize of [6, 12, 24]) {
      const result = newWeeklyDocument(
        [
          allDay,
          timed(
            "Plan",
            "2026-10-05T09:00:00-04:00",
            "2026-10-05T11:00:00-04:00",
          ),
        ],
        { ...options, fontSize, textAlign: "right" },
      );
      const objects = result.document.pages[0].objects;
      const labels = objects.filter((o) =>
        /all-day ·|Event \d+ label/.test(o.label),
      );
      expect(labels.length).toBeGreaterThan(1);
      for (const label of labels) {
        expect(label.fontSize).toBe(fontSize);
        expect(label.textAlign).toBe("right");
      }
      const allDayLabel = labels.find((o) => o.label.includes("all-day ·"))!;
      const divider = objects.find((o) =>
        o.label.endsWith("all-day divider 1"),
      )!;
      const firstHour = objects.find((o) => /^Hour \d+ rule$/.test(o.label))!;
      expect(allDayLabel.y + allDayLabel.height).toBeLessThan(divider.y);
      expect(divider.y).toBeLessThan(firstHour.y);
      expect(objects.find((o) => o.label === "2026-10-05 date")?.fontSize).toBe(
        17,
      );
      expect(
        objects.find((o) => /Hour \d+ label$/.test(o.label))?.fontSize,
      ).toBe(6);
      expect(
        normaliseDocument(JSON.parse(JSON.stringify(result.document))),
      ).toEqual(result.document);
    }
  });
  it.each(["left", "center", "right"] as const)(
    "positions %s arrows inside long event lanes and omits short arrows at every padding limit",
    (arrowPosition) => {
      const events = [
        timed("Plan", "2026-10-05T09:00:00Z", "2026-10-05T12:00:00Z"),
        timed("Call", "2026-10-05T09:15:00Z", "2026-10-05T09:45:00Z"),
      ];
      const segments = timedSegments(events, options.week, "UTC");
      for (const arrowPadding of [0, 2.5, 10]) {
        const result = newWeeklyDocument(events, {
          ...options,
          timeZone: "UTC",
          hours: "full",
          fontSize: 12,
          arrowPosition,
          arrowPadding,
          textAlign: "center",
        });
        const objects = result.document.pages[0].objects;
        segments.forEach((segment, index) => {
          const arrow = objects.find((o) =>
            o.label.startsWith(`Event ${index + 1} duration arrow`),
          );
          if (segment.event.id === "Call") {
            expect(arrow).toBeUndefined();
            return;
          }
          expect(arrow).toBeDefined();
          if (!arrow) return;
          const laneX =
            46.85 + (segment.lane * (31.75 - 4 - 1.2)) / segment.lanes;
          const laneWidth = (31.75 - 4 - 1.2) / segment.lanes - 0.4;
          if (arrowPosition === "left") expect(arrow.x).toBeCloseTo(laneX);
          else if (arrowPosition === "right")
            expect(arrow.x + arrow.width).toBeCloseTo(laneX + laneWidth);
          else
            expect(arrow.x + arrow.width / 2).toBeCloseTo(
              laneX + laneWidth / 2,
            );
          const endY = 22 + (segment.end / 1440) * 173;
          const durationHeight = ((segment.end - segment.start) / 1440) * 173;
          expect(endY - (arrow.y + arrow.height)).toBeCloseTo(
            Math.min(arrowPadding, durationHeight / 4),
          );
          expect(arrow.height).toBeGreaterThan(0);
          const label =
            objects.find((o) =>
              o.label.startsWith(`Event ${index + 1} label`),
            ) ||
            objects.find((o) =>
              o.label.startsWith(`Event ${index + 1} key marker`),
            );
          const textHeight = label
            ? label.text.split("\n").length *
              label.fontSize *
              0.3528 *
              label.lineHeight
            : 0;
          if (label && arrow.y < label.y + textHeight) {
            expect(
              label.x + label.width <= arrow.x ||
                label.x >= arrow.x + arrow.width,
            ).toBe(true);
          }
        });
      }
    },
  );
  it("retains complete short, long, overlapping and crowded all-day events in the key", () => {
    const title = "WW東京🌷".repeat(100);
    const events = [
      {
        ...timed(
          "short",
          "2026-10-05T09:00:00-04:00",
          "2026-10-05T09:15:00-04:00",
        ),
        title,
        location: "A quiet place",
      },
      ...Array.from({ length: 5 }, (_, i) => ({
        ...allDay,
        id: `all-${i}`,
        title: `All day ${i}`,
      })),
    ];
    const result = newWeeklyDocument(events, { ...options, locations: true });
    expect(result.needsKey).toBe(true);
    expect(result.document.pages.length).toBeGreaterThan(2);
    const key = result.document.pages
      .slice(2)
      .flatMap((p) => p.objects)
      .filter((o) => o.label.startsWith("Event "))
      .map((o) => o.text)
      .join("")
      .replaceAll("\n", "");
    expect(key).toContain(title);
    expect(key).toContain("A quiet place");
    for (let i = 0; i < 5; i++) expect(key).toContain(`All day ${i}`);
    expect(objectText(result)).toContain("+ 3 in event key");
    expect(
      newWeeklyDocument(events, { ...options, eventKey: false }).document.pages,
    ).toHaveLength(2);
  });
  it("omits sensitive titles, locations and calendar names from private document content and labels", () => {
    const event = {
      ...timed(
        "secret",
        "2026-10-05T09:00:00-04:00",
        "2026-10-05T09:15:00-04:00",
      ),
      title: "Private appointment",
      calendarName: "Secret calendar",
      location: "Private location",
    };
    const result = newWeeklyDocument([event], {
      ...options,
      privateTitles: true,
      locations: true,
    });
    const json = JSON.stringify(result.document);
    for (const secret of [event.title, event.calendarName, event.location])
      expect(json).not.toContain(secret);
    expect(json).toContain("Busy");
    expect(json).not.toContain(event.id);
  });
  it("keeps geometry inside A5 margins and fits actual-size Letter sheets with a 5.5 mm inset for every palette", () => {
    for (const theme of Object.keys(weeklyThemes) as WeeklyOptions["theme"][]) {
      const doc = newWeeklyDocument(
        sampleWeek(options.week, options.timeZone),
        { ...options, theme },
      ).document;
      const crops = doc.pages.map((page, index) => {
        const m = pageMargins(doc, index);
        for (const object of page.objects) {
          expect(object.x).toBeGreaterThanOrEqual(m.left);
          expect(object.y).toBeGreaterThanOrEqual(m.top);
          expect(object.x + object.width).toBeLessThanOrEqual(
            doc.paper.width - m.right + 0.001,
          );
          expect(object.y + object.height).toBeLessThanOrEqual(
            doc.paper.height - m.bottom + 0.001,
          );
        }
        return cropPage(page.id, index, doc.paper, page.objects);
      });
      expect(buildLetterLayout(doc.paper, crops, 5.5).errors).toEqual([]);
      const errors = buildLetterLayout(doc.paper, crops, 6).errors;
      expect(errors).toHaveLength(2);
      expect(
        errors.every(
          (error) =>
            error.excessWidth > 0 &&
            error.excessWidth < 0.5 &&
            error.excessHeight === 0,
        ),
      ).toBe(true);
    }
  });
  it("preserves decoration pages, unique IDs, backup serialization and original event inputs", () => {
    const events = sampleWeek(options.week, options.timeZone),
      before = JSON.stringify(events);
    const doc = newWeeklyDocument(events, options).document;
    expect(normaliseDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
    expect(syncPages(doc.pages, 1).map((p) => p.id)).toEqual(
      doc.pages.map((p) => p.id),
    );
    expect(
      doc.pages.flatMap((p) => p.objects).filter((o) => o.shape === "arrow"),
    ).toHaveLength(3);
    const ids = doc.pages.flatMap((p) => [p.id, ...p.objects.map((o) => o.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(JSON.stringify(events)).toBe(before);
    expect(Temporal.PlainDate.from(weekDates(options.week)[6]).dayOfWeek).toBe(
      7,
    );
  });
});
