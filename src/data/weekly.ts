import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import {
  createObject,
  normaliseDocument,
  type Page,
  type PaperObject,
} from "./model";
import { newDocument } from "./templates";
import type { CalendarEvent } from "../calendar/model";
import type { MeasurePaperText, PaperFont } from "./fonts";

export const weeklyThemes = {
  botanical: {
    label: "Soft sage",
    ink: "#485541",
    muted: "#758268",
    grid: "#c6cdbb",
  },
  rose: {
    label: "Rose & oat",
    ink: "#665048",
    muted: "#8d746b",
    grid: "#d8c8be",
  },
  mono: {
    label: "Pencil & paper",
    ink: "#424642",
    muted: "#707770",
    grid: "#ced1ca",
  },
} as const;
export type WeeklyTheme = keyof typeof weeklyThemes;
export const weeklyStyleSchema = z.object({
  fontSize: z.number().finite().min(6).max(24).default(8.5),
  arrowPosition: z.enum(["left", "center", "right"]).default("center"),
  arrowPadding: z.number().finite().min(0).max(10).default(1),
  textAlign: z.enum(["left", "center", "right"]).default("left"),
});
export type WeeklyStyle = z.infer<typeof weeklyStyleSchema>;
export type WeeklyOptions = Partial<WeeklyStyle> & {
  week: string;
  timeZone: string;
  theme: WeeklyTheme;
  privateTitles: boolean;
  locations: boolean;
  eventKey: boolean;
  hours?: "events" | "full";
  font?: PaperFont;
  measureText?: MeasurePaperText;
};
export type EventSegment = {
  event: CalendarEvent;
  day: number;
  start: number;
  end: number;
  lane: number;
  lanes: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

export function mondayOf(date: string): string {
  const day = Temporal.PlainDate.from(date);
  return day.subtract({ days: day.dayOfWeek - 1 }).toString();
}
export function currentWeek(
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  return mondayOf(Temporal.Now.plainDateISO(timeZone).toString());
}
export function weekDates(week: string): string[] {
  const monday = Temporal.PlainDate.from(mondayOf(week));
  return Array.from({ length: 7 }, (_, day) =>
    monday.add({ days: day }).toString(),
  );
}
export function weekBounds(week: string, timeZone: string) {
  const dates = weekDates(week);
  return {
    start: Temporal.PlainDate.from(dates[0])
      .toZonedDateTime(timeZone)
      .toInstant()
      .toString(),
    end: Temporal.PlainDate.from(dates[0])
      .add({ days: 7 })
      .toZonedDateTime(timeZone)
      .toInstant()
      .toString(),
  };
}
export function eventsOnDate(
  events: CalendarEvent[],
  date: string,
): CalendarEvent[] {
  return events.filter(
    (event) => event.allDay && event.start <= date && event.end > date,
  );
}
const minute = (instant: Temporal.Instant, timeZone: string) => {
  const local = instant.toZonedDateTimeISO(timeZone);
  return local.hour * 60 + local.minute + local.second / 60;
};
export function timedSegments(
  events: CalendarEvent[],
  week: string,
  timeZone: string,
): EventSegment[] {
  const segments: EventSegment[] = [];
  weekDates(week).forEach((date, day) => {
    const start = Temporal.PlainDate.from(date)
      .toZonedDateTime(timeZone)
      .toInstant();
    const end = Temporal.PlainDate.from(date)
      .add({ days: 1 })
      .toZonedDateTime(timeZone)
      .toInstant();
    const daily: EventSegment[] = [];
    for (const event of events.filter((event) => !event.allDay)) {
      const a = Temporal.Instant.from(event.start),
        b = Temporal.Instant.from(event.end);
      if (
        Temporal.Instant.compare(b, start) <= 0 ||
        Temporal.Instant.compare(a, end) >= 0 ||
        Temporal.Instant.compare(b, a) <= 0
      )
        continue;
      const before = Temporal.Instant.compare(a, start) < 0,
        after = Temporal.Instant.compare(b, end) > 0;
      const from = before ? 0 : minute(a, timeZone),
        to = Temporal.Instant.compare(b, end) >= 0 ? 1440 : minute(b, timeZone);
      // Wall-clock columns match the printed planner. During the autumn clock
      // repeat, a positive-duration event can end at an earlier clock reading.
      daily.push({
        event,
        day,
        start: from,
        end: Math.min(1440, Math.max(from + 1, to)),
        lane: 0,
        lanes: 1,
        continuesBefore: before,
        continuesAfter: after,
      });
    }
    daily.sort(
      (a, b) =>
        a.start - b.start ||
        b.end - a.end ||
        a.event.id.localeCompare(b.event.id),
    );
    let group: EventSegment[] = [],
      groupEnd = -1,
      laneEnds: number[] = [];
    const finish = () => {
      for (const segment of group) segment.lanes = laneEnds.length;
      group = [];
      laneEnds = [];
    };
    for (const segment of daily) {
      if (segment.start >= groupEnd && group.length) finish();
      let lane = laneEnds.findIndex((end) => end <= segment.start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = segment.end;
      segment.lane = lane;
      group.push(segment);
      groupEnd = Math.max(group.length === 1 ? -1 : groupEnd, segment.end);
    }
    finish();
    segments.push(...daily);
  });
  return segments;
}
const clock = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
export function weeklyHourRange(
  segments: EventSegment[],
  mode: WeeklyOptions["hours"] = "events",
) {
  if (mode === "full") return { start: 0, end: 24 };
  if (!segments.length) return { start: 8, end: 20 };
  let start = Math.max(
    0,
    Math.floor(Math.min(...segments.map((s) => s.start)) / 60) - 1,
  );
  let end = Math.min(
    24,
    Math.ceil(Math.max(...segments.map((s) => s.end)) / 60) + 1,
  );
  // A shared scale across all seven days preserves time comparisons. Keep a
  // useful six-hour window even when the week contains only one short event.
  const extra = Math.max(0, 6 - (end - start));
  start = Math.max(0, start - Math.floor(extra / 2));
  end = Math.min(24, Math.max(end, start + 6));
  start = Math.min(start, end - 6);
  return { start, end };
}
function compact(
  words: string,
  width: number,
  lines: number,
  size = 8.5,
  measureText?: MeasurePaperText,
) {
  const clean = words.replace(/\s+/g, " ").trim();
  if (lines < 1 || width <= 0)
    return { text: "", shortened: Boolean(clean), lines: 0 };
  // Use loaded font metrics in the studio, with conservative DM Sans estimates
  // for non-browser callers. Explicit breaks survive document backup and print.
  const em = (char: string) =>
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}\uFF01-\uFF60]/u.test(
      char,
    )
      ? 1.1
      : /[ilI.,:;'!| ]/.test(char)
        ? 0.3
        : /[MW@%]/.test(char)
          ? 0.95
          : /[A-Z]/.test(char)
            ? 0.72
            : 0.57;
  const widthOf = (text: string) =>
    measureText
      ? measureText(text, size) * 1.02
      : [...text].reduce((sum, char) => sum + em(char), 0) * size * 0.3528;
  const wrapped: string[] = [];
  let line = "";
  for (const char of clean) {
    while (line && widthOf(line + char) > width) {
      const space = line.lastIndexOf(" ");
      if (space > 0) {
        wrapped.push(line.slice(0, space));
        line = line.slice(space + 1);
      } else {
        wrapped.push(line);
        line = "";
      }
    }
    line += char;
  }
  if (line) wrapped.push(line.trimEnd());
  const shortened = wrapped.length > lines;
  const visible = wrapped.slice(0, lines);
  if (shortened && visible.length) {
    let last = visible[visible.length - 1].trimEnd();
    while (last && widthOf(last + "…") > width)
      last = [...last].slice(0, -1).join("");
    visible[visible.length - 1] = last + "…";
  }
  return { text: visible.join("\n"), shortened, lines: visible.length };
}
function keyLines(words: string) {
  // At 9pt, 36 em-units fit inside 124mm even for wide glyphs. Keep every
  // character; emoji and East Asian characters reserve two units.
  return words.split("\n").flatMap((paragraph) => {
    const lines: string[] = [];
    let line = "",
      units = 0;
    const unitsOf = (char: string) =>
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}\uFF01-\uFF60]/u.test(
        char,
      )
        ? 2
        : 1;
    for (const char of paragraph) {
      const width = unitsOf(char);
      if (units + width > 36) {
        const space = line.lastIndexOf(" ");
        if (space > 0) {
          lines.push(line.slice(0, space + 1));
          line = line.slice(space + 1);
          units = [...line].reduce((sum, char) => sum + unitsOf(char), 0);
        } else {
          lines.push(line);
          line = "";
          units = 0;
        }
      }
      line += char;
      units += width;
    }
    lines.push(line);
    return lines;
  });
}
export function newWeeklyDocument(
  events: CalendarEvent[],
  options: WeeklyOptions,
) {
  const dates = weekDates(options.week);
  const month = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${dates[0]}T12:00:00Z`));
  const theme = weeklyThemes[options.theme];
  const style = weeklyStyleSchema.parse(options);
  const font = options.font ?? "DM Sans";
  const doc = newDocument("blank");
  doc.title = `A little week · ${dates[0]}`;
  doc.typography = { font, size: 10, color: theme.ink };
  const segments = timedSegments(events, dates[0], options.timeZone);
  const hourRange = weeklyHourRange(segments, options.hours);
  const relevant = events.filter((event) =>
    event.allDay
      ? dates.some((date) => eventsOnDate([event], date).length)
      : segments.some((segment) => segment.event === event),
  );
  const numbers = new Map(relevant.map((event, index) => [event, index + 1]));
  let needsKey = false;
  const title = (event: CalendarEvent) =>
    options.privateTitles ? "Busy" : event.title;
  const weekdays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const pages: Page[] = [0, 1].map((pageIndex) => {
    const objects: PaperObject[] = [];
    const text = (
      label: string,
      words: string,
      x: number,
      y: number,
      width: number,
      height: number,
      size = 7,
      textFont: PaperObject["font"] = font,
      color: string = theme.ink,
      textAlign: PaperObject["textAlign"] = "left",
    ) =>
      objects.push(
        createObject("text", {
          label: label.slice(0, 200),
          text: words,
          x,
          y,
          width,
          height,
          font: textFont,
          fontSize: size,
          lineHeight: 1.2,
          textAlign,
          color,
        }),
      );
    const shape = (
      label: string,
      x: number,
      y: number,
      width: number,
      height: number,
      fill: string,
      locked = true,
    ) =>
      objects.push(
        createObject("shape", { label, x, y, width, height, fill, locked }),
      );
    const dayIndices = pageIndex === 0 ? [0, 1, 2] : [3, 4, 5, 6];
    const gridX = 18,
      width = 118 / dayIndices.length;
    const allDayRows = Math.min(
      3,
      Math.max(...dates.map((date) => eventsOnDate(relevant, date).length)),
    );
    const allDayTextHeight = style.fontSize * 0.3528 * 1.2 * 2 + 0.15;
    const allDayRowHeight = Math.max(7.5, allDayTextHeight + 0.8);
    const bandTop = 34,
      bandHeight = allDayRows * allDayRowHeight;
    const top = bandTop + (bandHeight ? bandHeight + 1 : 0),
      height = 195 - top;
    const hours = hourRange.end - hourRange.start;
    text("Month heading", month, 12, 12, 124, 6, 12, "Lora");
    text(
      "Week and time zone",
      `${dates[0]} — ${dates[6]}  ·  ${options.timeZone}`,
      12,
      20,
      124,
      4,
      7,
      "DM Sans",
      theme.muted,
    );
    for (const [column, day] of dayIndices.entries()) {
      const x = gridX + column * width;
      text(
        `${dates[day]} day heading`,
        `${weekdays[day]}  ${dates[day].slice(8)}`,
        x + 1.3,
        27,
        width - 2.6,
        4.5,
        8.5,
        "DM Sans",
        day > 4 && options.theme !== "mono" ? "#996d5a" : theme.ink,
      );
      const allDay = eventsOnDate(relevant, dates[day]);
      if (allDay.length > 3) needsKey = true;
      allDay.slice(0, allDay.length > 3 ? 2 : 3).forEach((event, row) => {
        let result = compact(
          title(event),
          width - 2.6,
          2,
          style.fontSize,
          options.measureText,
        );
        if (result.shortened && options.eventKey)
          result = compact(
            `${numbers.get(event)} · ${title(event)}`,
            width - 2.6,
            2,
            style.fontSize,
            options.measureText,
          );
        needsKey ||= result.shortened;
        text(
          `${dates[day]} all-day · ${title(event)}`,
          result.text,
          x + 1.3,
          bandTop + 0.4 + row * allDayRowHeight,
          width - 2.6,
          allDayTextHeight,
          style.fontSize,
          font,
          theme.ink,
          style.textAlign,
        );
        shape(
          `${dates[day]} all-day divider ${row + 1}`,
          x + 0.6,
          bandTop + (row + 1) * allDayRowHeight - 0.25,
          width - 1.2,
          0.25,
          theme.grid,
        );
      });
      if (allDay.length > 3)
        text(
          `${dates[day]} extra all-day events`,
          compact(
            `+ ${allDay.length - 2} ${options.eventKey ? "in event key" : "all-day events"}`,
            width - 2.6,
            2,
            style.fontSize,
            options.measureText,
          ).text,
          x + 1.3,
          bandTop + allDayRowHeight * 2 + 0.4,
          width - 2.6,
          allDayTextHeight,
          style.fontSize,
          font,
          theme.ink,
          style.textAlign,
        );
    }
    for (let hour = hourRange.start; hour <= hourRange.end; hour++) {
      const y = top + ((hour - hourRange.start) * height) / hours;
      shape(`Hour ${hour} rule`, gridX, y, 118, 0.15, theme.grid);
      text(
        `Hour ${hour} label`,
        String(hour).padStart(2, "0"),
        12.7,
        y - 1.3,
        4.5,
        3.2,
        6,
        "DM Sans",
        theme.muted,
      );
      if (hour < hourRange.end)
        shape(
          `Hour ${hour} half-hour rule`,
          gridX,
          y + height / (hours * 2),
          118,
          0.08,
          "#e4e7db",
        );
    }
    for (let column = 0; column <= dayIndices.length; column++)
      shape(
        `Day column rule ${column}`,
        gridX + column * width - (column === dayIndices.length ? 0.15 : 0),
        bandTop,
        0.15,
        195 - bandTop,
        theme.grid,
      );
    for (const segment of segments.filter((segment) =>
      dayIndices.includes(segment.day),
    )) {
      const x =
        gridX +
        dayIndices.indexOf(segment.day) * width +
        0.6 +
        (segment.lane * (width - 1.2)) / segment.lanes;
      const w = (width - 1.2) / segment.lanes - 0.4;
      const y = top + ((segment.start / 60 - hourRange.start) / hours) * height;
      const h = ((segment.end - segment.start) / 60 / hours) * height;
      const n = numbers.get(segment.event);
      const label = `${clock(segment.start)}–${clock(segment.end)} · ${title(segment.event)}`;
      const size = style.fontSize;
      const lines = Math.floor((h - 1.2) / (size * 0.3528 * 1.2));
      let result = compact(
        title(segment.event),
        w - 1.6,
        Math.max(0, lines),
        size,
        options.measureText,
      );
      if (result.shortened && options.eventKey)
        result = compact(
          `${n} · ${title(segment.event)}`,
          w - 1.6,
          Math.max(0, lines),
          size,
          options.measureText,
        );
      needsKey ||=
        lines < 1 ||
        result.shortened ||
        segment.continuesBefore ||
        segment.continuesAfter;
      const lineHeight = size * 0.3528 * 1.2;
      const titleHeight = result.lines * lineHeight + 0.15;
      // Keep the tip off the end-time rule; tiny events retain a visible arrow.
      const bottomGap = Math.min(style.arrowPadding, h / 4);
      const arrowEnd = y + h - bottomGap;
      const belowTitle = h - bottomGap - 0.6 - titleHeight - 0.8;
      const arrowWidth = Math.min(2.5, Math.max(0.5, w - 1));
      // Short events keep the arrow beside the title so the two do not collide.
      const beside = lines < 1 || belowTitle < 2.5;
      const arrowY = beside ? y : y + 0.6 + titleHeight + 0.8;
      const arrowX =
        style.arrowPosition === "left"
          ? x
          : style.arrowPosition === "right"
            ? x + w - arrowWidth
            : x + (w - arrowWidth) / 2;
      objects.push(
        createObject("shape", {
          label: `Event ${n} duration arrow · ${label}`.slice(0, 200),
          shape: "arrow",
          x: arrowX,
          y: arrowY,
          width: arrowWidth,
          height: arrowEnd - arrowY,
          fill: weeklyThemes.mono.muted,
          locked: false,
        }),
      );
      // Reserve a clear text region beside short arrows at any chosen position.
      const leftRegion = { x: x + 0.8, width: arrowX - x - 1.5 };
      const rightRegion = {
        x: arrowX + arrowWidth + 0.7,
        width: x + w - 0.8 - (arrowX + arrowWidth + 0.7),
      };
      const sideRegion =
        leftRegion.width > rightRegion.width + 0.001 ? leftRegion : rightRegion;
      const labelRegion = beside ? sideRegion : { x: x + 0.8, width: w - 1.6 };
      const labelWidth = labelRegion.width;
      if (lines > 0 && labelWidth > 3) {
        if (beside) {
          result = compact(
            title(segment.event),
            labelWidth,
            lines,
            size,
            options.measureText,
          );
          if (result.shortened && options.eventKey)
            result = compact(
              `${n} · ${title(segment.event)}`,
              labelWidth,
              lines,
              size,
              options.measureText,
            );
          needsKey ||= result.shortened;
        }
        text(
          `Event ${n} label · ${label}`,
          result.text,
          labelRegion.x,
          y + 0.6,
          labelWidth,
          h - 1.2,
          size,
          font,
          theme.ink,
          style.textAlign,
        );
      } else if (sideRegion.width > 2)
        text(
          `Event ${n} key marker · ${label}`,
          String(n),
          sideRegion.x,
          Math.min(y + 0.4, top + height - 3.5),
          Math.min(sideRegion.width, 5),
          3.5,
          6,
        );
    }
    return { id: crypto.randomUUID(), objects };
  });
  if (options.eventKey && needsKey) {
    let page: Page | undefined,
      y = 38;
    for (const event of relevant) {
      const dateTime = (instant: string) => {
        const local = Temporal.Instant.from(instant).toZonedDateTimeISO(
          options.timeZone,
        );
        return `${local.toPlainDateTime().toString().slice(0, 16).replace("T", " ")} (UTC${local.offset})`;
      };
      const a = event.allDay ? event.start : dateTime(event.start);
      const b = event.allDay
        ? `through ${Temporal.PlainDate.from(event.end).subtract({ days: 1 })}`
        : dateTime(event.end);
      const words = `${numbers.get(event)} · ${title(event)}\n${a} — ${b}${options.privateTitles ? "" : ` · ${event.calendarName}`}${options.locations && !options.privateTitles && event.location ? `\n${event.location}` : ""}`;
      // Conservative text wrapping keeps long event names editable and printable.
      const wrapped = keyLines(words);
      for (let offset = 0; offset < wrapped.length;) {
        if (!page || y + 5 > 194) {
          if (pages.length >= 500)
            throw new Error(
              "This event key exceeds 500 pages. Choose fewer calendars or turn off the event key.",
            );
          page = { id: crypto.randomUUID(), objects: [] };
          pages.push(page);
          y = 38;
          page.objects.push(
            createObject("text", {
              label: "Calendar event key heading",
              text: "A little more detail",
              x: 12,
              y: 12,
              width: 124,
              height: 13,
              font: "Lora",
              fontSize: 22,
              color: theme.ink,
            }),
            createObject("text", {
              label: "Calendar event key week",
              text: `${dates[0]} — ${dates[6]} · ${options.timeZone}`,
              x: 12,
              y: 27,
              width: 124,
              height: 5,
              font: "DM Sans",
              fontSize: 8,
              color: theme.muted,
            }),
          );
        }
        const count = Math.min(
          wrapped.length - offset,
          Math.floor((194 - y) / 5),
        );
        page.objects.push(
          createObject("text", {
            label: `Event ${numbers.get(event)} details`.slice(0, 200),
            text: wrapped.slice(offset, offset + count).join("\n"),
            x: 12,
            y,
            width: 124,
            height: count * 5,
            font: "DM Sans",
            fontSize: 9,
            color: theme.ink,
          }),
        );
        offset += count;
        y += count * 5 + 4;
      }
    }
  }
  doc.pages = pages;
  return {
    document: normaliseDocument(doc),
    eventCount: relevant.length,
    needsKey,
    keyPages: pages.length - 2,
    hourRange,
  };
}
export function sampleWeek(week: string, timeZone: string): CalendarEvent[] {
  const dates = weekDates(week);
  const instant = (day: number, hour: number, minute = 0) =>
    Temporal.PlainDate.from(dates[day])
      .toZonedDateTime({
        timeZone,
        plainTime: Temporal.PlainTime.from({ hour, minute }),
      })
      .toInstant()
      .toString();
  return [
    {
      id: "sample-1",
      calendarId: "personal",
      calendarName: "Personal",
      title: "Coffee & a slow start",
      location: "",
      allDay: false,
      start: instant(0, 9),
      end: instant(0, 11),
    },
    {
      id: "sample-2",
      calendarId: "work",
      calendarName: "Work",
      title: "A little focused work",
      location: "",
      allDay: false,
      start: instant(1, 10),
      end: instant(1, 13),
    },
    {
      id: "sample-3",
      calendarId: "personal",
      calendarName: "Personal",
      title: "A walk in the park",
      location: "",
      allDay: false,
      start: instant(2, 15),
      end: instant(2, 17),
    },
    {
      id: "sample-4",
      calendarId: "personal",
      calendarName: "Personal",
      title: "Dinner with a friend",
      location: "",
      allDay: false,
      start: instant(3, 18),
      end: instant(3, 20),
    },
    {
      id: "sample-5",
      calendarId: "work",
      calendarName: "Work",
      title: "Make something lovely",
      location: "",
      allDay: false,
      start: instant(4, 9),
      end: instant(4, 12),
    },
    {
      id: "sample-6",
      calendarId: "personal",
      calendarName: "Personal",
      title: "For myself",
      location: "",
      allDay: true,
      start: dates[5],
      end: dates[6],
    },
    {
      id: "sample-7",
      calendarId: "personal",
      calendarName: "Personal",
      title: "Tea, pages & little plans",
      location: "",
      allDay: false,
      start: instant(6, 14),
      end: instant(6, 17),
    },
  ];
}
