import { describe, expect, it, vi } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import { calendarSearch, weekRequest } from "../src/calendar/model";
import type { CalendarEvent } from "../src/calendar/model";
import {
  currentWeek,
  eventsOnDate,
  mondayOf,
  newWeeklyDocument,
  sampleWeek,
  timedSegments,
  weekBounds,
  weekDates,
  weeklyThemes,
  weeklyHourRange,
  weeklyStyleSchema,
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
  it("creates a compact two-page A5 calendar with seven full-width columns and daytime fallback", () => {
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
      ["MON  05", "TUE  06", "WED  07"],
      ["THU  08", "FRI  09", "SAT  10", "SUN  11"],
    ]);
    for (const page of result.document.pages) {
      expect(
        page.objects.filter((o) => /^Hour \d+ label$/.test(o.label)),
      ).toHaveLength(13);
      expect(page.objects.find((o) => o.label === "Month heading")?.text).toBe(
        "October",
      );
      expect(
        page.objects.filter((o) => o.type === "shape").every((o) => o.locked),
      ).toBe(true);
    }
    expect(result.hourRange).toEqual({ start: 8, end: 20 });
    expect(
      result.document.pages
        .flatMap((p) => p.objects)
        .some((o) =>
          /Weekly footer|Mini month|intentions|Small joys|botanical detail/.test(
            o.label,
          ),
        ),
    ).toBe(false);
    expect(
      result.document.pages[0].objects.find((o) => o.label === "Month heading")
        ?.fontSize,
    ).toBe(12);
    expect(
      result.document.pages[0].objects.find(
        (o) => o.label === "2026-10-05 day heading",
      )?.width,
    ).toBeCloseTo(118 / 3 - 2.6);
    expect(
      result.document.pages[0].objects.some((o) =>
        o.label.endsWith("all-day band"),
      ),
    ).toBe(false);
  });
  it("renders the sample at real clock positions without requiring extra key pages", () => {
    const result = newWeeklyDocument(
      sampleWeek(options.week, options.timeZone),
      options,
    );
    expect(result.eventCount).toBe(7);
    expect(result.document.pages).toHaveLength(2);
    const coffee = result.document.pages[0].objects.find(
      (o) => o.shape === "arrow" && o.label.includes("Coffee"),
    )!;
    expect(result.hourRange).toEqual({ start: 8, end: 21 });
    const top = result.document.pages[0].objects.find(
        (o) => o.label === "Hour 8 rule",
      )!.y,
      height = 195 - top;
    expect(coffee.y + coffee.height).toBeCloseTo(
      top + ((11 - 8) / 13) * height - 1,
    );
    const label = result.document.pages[0].objects.find(
      (o) => o.type === "text" && o.label.includes("Coffee"),
    )!;
    expect(label.y).toBeCloseTo(top + ((9 - 8) / 13) * height + 0.6);
    expect(coffee.y).toBeGreaterThan(label.y + 8.5 * 0.3528 * 1.2);
    expect(coffee.locked).toBe(false);
  });
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
      expect(label.lineHeight).toBe(1.2);
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
      expect(arrow.shape).toBe("arrow");
      expect(arrow.y + arrow.height).toBeCloseTo(
        34 + ((end - 7) / 9) * 161 - 1,
      );
      expect(label.y).toBeCloseTo(34 + ((start - 7) / 9) * 161 + 0.6);
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
        /^Hour \d+ label$/.test(o.label),
      ),
    ).toHaveLength(25);
    expect(full.needsKey).toBe(true);
    expect(
      focused.document.pages[0].objects.find((o) =>
        o.label.startsWith("Event 1 duration arrow"),
      )!.height,
    ).toBeGreaterThan(
      full.document.pages[0].objects.find((o) =>
        o.label.startsWith("Event 1 duration arrow"),
      )!.height,
    );
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
      expect(arrows).toHaveLength(segments.length);
      arrows.forEach((arrow, i) => {
        const range = result.hourRange;
        const durationHeight =
          ((segments[i].end - segments[i].start) /
            60 /
            (range.end - range.start)) *
          161;
        expect(arrow.y + arrow.height).toBeCloseTo(
          34 +
            ((segments[i].end / 60 - range.start) / (range.end - range.start)) *
              161 -
            Math.min(1, durationHeight / 4),
        );
        expect(arrow.height).toBeGreaterThan(0);
      });
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
  it("keeps short and overlapping arrows in their lanes with padded end-time tips and readable labels beside them", () => {
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
    const segments = timedSegments(events, options.week, "UTC");
    segments.forEach((segment, i) => {
      const arrow = objects.find((o) =>
        o.label.startsWith(`Event ${i + 1} duration arrow`),
      )!;
      const label = objects.find((o) =>
        o.label.startsWith(`Event ${i + 1} label`),
      );
      expect(arrow.y).toBeCloseTo(34 + (segment.start / 1440) * 161);
      expect(arrow.y + arrow.height).toBeCloseTo(
        34 +
          (segment.end / 1440) * 161 -
          Math.min(1, (((segment.end - segment.start) / 1440) * 161) / 4),
      );
      if (label) expect(label.x).toBeGreaterThan(arrow.x + arrow.width);
    });
    const arrows = objects.filter((o) => o.shape === "arrow");
    expect(arrows).toHaveLength(2);
    expect(arrows[0].x + arrows[0].width).toBeLessThan(arrows[1].x);
    expect(result.needsKey).toBe(true);
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
      expect(objects.find((o) => o.label === "Month heading")?.fontSize).toBe(
        12,
      );
      expect(
        objects.find((o) => /^Hour \d+ label$/.test(o.label))?.fontSize,
      ).toBe(6);
      expect(
        normaliseDocument(JSON.parse(JSON.stringify(result.document))),
      ).toEqual(result.document);
    }
  });
  it.each(["left", "center", "right"] as const)(
    "positions %s arrows inside event lanes and keeps short labels clear at every padding limit",
    (arrowPosition) => {
      const events = [
        timed("Plan", "2026-10-05T09:00:00Z", "2026-10-05T11:00:00Z"),
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
          )!;
          const laneX = 18.6 + (segment.lane * (118 / 3 - 1.2)) / segment.lanes;
          const laneWidth = (118 / 3 - 1.2) / segment.lanes - 0.4;
          if (arrowPosition === "left") expect(arrow.x).toBeCloseTo(laneX);
          else if (arrowPosition === "right")
            expect(arrow.x + arrow.width).toBeCloseTo(laneX + laneWidth);
          else
            expect(arrow.x + arrow.width / 2).toBeCloseTo(
              laneX + laneWidth / 2,
            );
          const endY = 34 + (segment.end / 1440) * 161;
          const durationHeight = ((segment.end - segment.start) / 1440) * 161;
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
  it("keeps geometry inside margins and fits actual-size Letter sheets for every palette", () => {
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
      expect(buildLetterLayout(doc.paper, crops).errors).toEqual([]);
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
    ).toHaveLength(6);
    const ids = doc.pages.flatMap((p) => [p.id, ...p.objects.map((o) => o.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(JSON.stringify(events)).toBe(before);
    expect(Temporal.PlainDate.from(weekDates(options.week)[6]).dayOfWeek).toBe(
      7,
    );
  });
});
