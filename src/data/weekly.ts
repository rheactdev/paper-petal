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
import {
  dailyWeatherText,
  weatherDescription,
  weatherIcon,
  type WeeklyWeather,
} from "../weather/model";

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
export const WEEKLY_COLUMN_WIDTH_MM = 31.75;
export function weeklyPageLayout(page: 0 | 1) {
  const days = page === 0 ? [0, 1, 2] : [3, 4, 5, 6];
  return {
    days,
    gridX: 10.5 + (page === 0 ? WEEKLY_COLUMN_WIDTH_MM : 0),
    columnWidth: WEEKLY_COLUMN_WIDTH_MM,
    gridWidth: days.length * WEEKLY_COLUMN_WIDTH_MM,
    hourGutter: 4,
  };
}
export const calendarTimeFormatSchema = z.enum(["12h", "24h"]);
export type CalendarTimeFormat = z.infer<typeof calendarTimeFormatSchema>;
export const weeklyStyleSchema = z.object({
  fontSize: z.number().finite().min(6).max(24).default(8.5),
  arrowPosition: z.enum(["left", "center", "right"]).default("center"),
  arrowPadding: z.number().finite().min(0).max(10).default(1),
  textAlign: z.enum(["left", "center", "right"]).default("left"),
  timeFormat: calendarTimeFormatSchema.default("24h"),
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
  measureLabels?: MeasurePaperText;
  weather?: WeeklyWeather;
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
  clockAdjusted: boolean;
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
function assignLanes<T extends EventSegment>(daily: T[]): T[] {
  daily.sort(
    (a, b) =>
      a.start - b.start ||
      b.end - a.end ||
      a.event.id.localeCompare(b.event.id),
  );
  let group: T[] = [],
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
  return daily;
}
export function halfHourInterval(start: number, end: number) {
  const roundedStart = Math.min(1410, Math.max(0, Math.round(start / 30) * 30));
  return {
    start: roundedStart,
    end: Math.min(1440, Math.max(roundedStart + 30, Math.round(end / 30) * 30)),
  };
}
export function halfHourSegments(segments: EventSegment[]) {
  const rounded = segments.map((segment) => ({
    ...segment,
    originalStart: segment.start,
    originalEnd: segment.end,
    ...halfHourInterval(segment.start, segment.end),
  }));
  // Rounding can create overlaps between previously separate appointments.
  return Array.from({ length: 7 }, (_, day) =>
    assignLanes(rounded.filter((segment) => segment.day === day)),
  ).flat();
}
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
        clockAdjusted: to <= from,
      });
    }
    segments.push(...assignLanes(daily));
  });
  return segments;
}
export function formatCalendarTime(
  value: number,
  format: CalendarTimeFormat = "24h",
) {
  const hour = Math.floor(value / 60),
    minutes = String(Math.floor(value % 60)).padStart(2, "0");
  if (format === "24h") return `${String(hour).padStart(2, "0")}:${minutes}`;
  return `${hour % 12 || 12}:${minutes} ${hour % 24 < 12 ? "AM" : "PM"}`;
}
export function formatCalendarHour(
  hour: number,
  format: CalendarTimeFormat = "24h",
) {
  return String(format === "12h" ? hour % 12 || 12 : hour);
}
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
  // STYLE: Wrapping Event Line Spacing
  const eventLineSpacing = 1.3;
  const doc = newDocument("blank");
  doc.paper.margins.inner = 10;
  doc.paper.margins.outer = 10;
  doc.title = `A little week · ${dates[0]}`;
  doc.typography = { font, size: 10, color: theme.ink };
  const segments = halfHourSegments(
    timedSegments(events, dates[0], options.timeZone),
  );
  const hourRange = weeklyHourRange(segments, options.hours);
  // The focused view normally starts with an empty hour of breathing room.
  // Use that hour for weather, while retaining every hour with appointments.
  if (
    options.weather &&
    options.hours !== "full" &&
    segments.every((segment) => segment.start >= (hourRange.start + 1) * 60)
  )
    hourRange.start++;
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
  const pages: Page[] = ([0, 1] as const).map((pageIndex) => {
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
      lineHeight = 1.2,
      textLayout?: PaperObject["textLayout"],
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
          lineHeight,
          ...(textLayout ? { textLayout } : {}),
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
    const {
      days: dayIndices,
      gridX,
      columnWidth: width,
      gridWidth,
      hourGutter,
    } = weeklyPageLayout(pageIndex);
    const allDayRows = Math.min(
      3,
      Math.max(...dates.map((date) => eventsOnDate(relevant, date).length)),
    );
    const allDayTextHeight =
      style.fontSize * 0.3528 * eventLineSpacing * 2 + 0.15;
    const allDayRowHeight = Math.max(7.5, allDayTextHeight + 0.8);
    const headerTop = 12,
      bandTop = 22,
      bandHeight = allDayRows * allDayRowHeight;
    const hours = hourRange.end - hourRange.start;
    const weatherTop = bandTop + (bandHeight ? bandHeight + 1 : 0);
    // Replace the top hour-sized space with weather, without covering early
    // appointments or dropping the first hour from a full-day timeline.
    const weatherHeight = options.weather
      ? Math.max(6, (195 - weatherTop) / (hours + 1))
      : 0;
    const top = weatherTop + weatherHeight,
      height = 195 - top;
    const rowHeight = height / (hours * 2);
    const fontHeight = style.fontSize * 0.3528;
    // Keep wrapped lines in step with the ruling. Sparse timelines can fit
    // several text lines per row; dense timelines use one line per row.
    // Oversized text keeps its normal leading when it cannot fit a ruled row.
    const maxLinesPerRow = Math.floor(rowHeight / (fontHeight * 1.1));
    const linesPerRow = Math.max(
      1,
      Math.min(
        maxLinesPerRow,
        Math.round(rowHeight / (fontHeight * eventLineSpacing)),
      ),
    );
    const timedLineHeight = maxLinesPerRow
      ? rowHeight / linesPerRow
      : fontHeight * eventLineSpacing;
    const timedLineSpacing = timedLineHeight / fontHeight;
    if (pageIndex === 0) {
      // The spare 1.25-inch column holds a mini month and notes, with a little
      // breathing room before Monday's column.
      const sideX = 10.5,
        sideWidth = WEEKLY_COLUMN_WIDTH_MM - 6;
      const first = Temporal.PlainDate.from(dates[0]).with({ day: 1 });
      const offset = first.dayOfWeek - 1;
      const cellWidth = sideWidth / 7;
      text(
        "Mini month heading",
        `${month.toUpperCase()} ${first.year}`,
        sideX,
        12,
        sideWidth,
        3.5,
        6.5,
        "DM Sans",
        theme.ink,
      );
      ["M", "T", "W", "T", "F", "S", "S"].forEach((name, column) => {
        text(
          `Mini month weekday ${column + 1}`,
          name,
          sideX + column * cellWidth,
          17,
          cellWidth,
          3,
          6,
          "DM Sans",
          theme.muted,
          "center",
        );
      });
      for (let day = 1; day <= first.daysInMonth; day++) {
        const date = first.with({ day }).toString();
        const index = offset + day - 1,
          row = Math.floor(index / 7),
          column = index % 7;
        const x = sideX + column * cellWidth,
          y = 21 + row * 3.8;
        const selected = dates.includes(date);
        text(
          `Mini month date ${date}`,
          String(day),
          x,
          y,
          cellWidth,
          3,
          6,
          "DM Sans",
          selected ? theme.ink : theme.muted,
          "center",
        );
        if (selected)
          shape(
            `Mini month current week ${date}`,
            x + 0.3,
            y + 3.1,
            cellWidth - 0.6,
            0.15,
            theme.muted,
          );
      }
      const zone = compact(
        options.timeZone,
        sideWidth,
        Infinity,
        6,
        options.measureLabels,
      );
      const zoneTop = 47,
        zoneHeight = zone.lines * 6 * 0.3528 * 1.2 + 0.3,
        notesHeadingTop = zoneTop + zoneHeight + 3;
      text(
        "Calendar time zone",
        zone.text,
        sideX,
        zoneTop,
        sideWidth,
        zoneHeight,
        6,
        "DM Sans",
        theme.muted,
      );
      text(
        "Weekly notes heading",
        "LITTLE NOTES",
        sideX,
        notesHeadingTop,
        sideWidth,
        3.5,
        6.5,
        "DM Sans",
        theme.muted,
      );
      const notesTop = notesHeadingTop + 6,
        step = sideWidth / 7;
      const rows = Math.floor((195 - notesTop) / step),
        notesHeight = rows * step;
      for (let column = 0; column <= 7; column++)
        shape(
          `Weekly notes vertical rule ${column}`,
          sideX + column * step - 0.075,
          notesTop,
          0.15,
          notesHeight,
          theme.grid,
        );
      for (let row = 0; row <= rows; row++)
        shape(
          `Weekly notes horizontal rule ${row}`,
          sideX - 0.075,
          notesTop + row * step - 0.075,
          sideWidth + 0.15,
          0.15,
          theme.grid,
        );
      text(
        "Weekly notes",
        "",
        sideX + 0.8,
        notesTop + 0.8,
        sideWidth - 1.6,
        notesHeight - 1.6,
        8.5,
        font,
        theme.ink,
      );
    }
    for (const [column, day] of dayIndices.entries()) {
      const x = gridX + column * width;
      const forecast = options.weather?.days.find(
        (forecast) => forecast.date === dates[day],
      );
      const weatherText = forecast
        ? dailyWeatherText(forecast, options.weather!.unit)
        : "—";
      // Align the entire icon/temperature group to the column's right edge.
      // Weather has its own hour-height band beneath the date/all-day rows.
      const weatherWidth =
        (options.measureLabels?.(weatherText, 6) ??
          weatherText.length * 6 * 0.3528 * 0.6) + 0.5;
      const weatherX = x + width - 1.3 - weatherWidth;
      const iconX = weatherX - 0.6 - 3;
      const dayColor =
        day > 4 && options.theme !== "mono" ? "#996d5a" : theme.ink;
      text(
        `${dates[day]} date`,
        String(Temporal.PlainDate.from(dates[day]).day),
        x + 0.8,
        headerTop + 0.2,
        9.2,
        bandTop - headerTop - 0.4,
        20,
        "DM Sans",
        dayColor,
        "center",
        1,
        "center",
      );
      text(
        `${dates[day]} day heading`,
        weekdays[day],
        x + 12,
        headerTop + 0.2,
        width - 13.3,
        bandTop - headerTop - 0.4,
        8.5,
        "DM Sans",
        dayColor,
        "center",
        1,
        "center",
      );
      shape(
        `${dates[day]} date divider`,
        x + 10.8,
        headerTop,
        0.15,
        bandTop - headerTop,
        theme.grid,
      );
      if (options.weather) {
        text(
          `${dates[day]} weather estimate · ${forecast ? weatherDescription(forecast.code) : "Unavailable"}`,
          weatherText,
          weatherX,
          weatherTop + 0.5,
          weatherWidth,
          weatherHeight - 1,
          6,
          "DM Sans",
          theme.muted,
          "right",
          1,
          "center",
        );
        if (forecast)
          objects.push(
            createObject("sticker", {
              label: `${dates[day]} weather icon · ${weatherDescription(forecast.code)}`,
              sticker: weatherIcon(forecast.code),
              x: iconX,
              y: weatherTop + (weatherHeight - 3) / 2,
              width: 3,
              height: 3,
              color: theme.muted,
              locked: false,
            }),
          );
      }
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
          eventLineSpacing,
        );
        shape(
          `${dates[day]} all-day divider ${row + 1}`,
          x + 0.6,
          bandTop + (row + 1) * allDayRowHeight - 0.25,
          width - 1.2,
          0.15,
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
          eventLineSpacing,
        );
    }
    shape(
      "Day header top rule",
      gridX - 0.075,
      headerTop,
      gridWidth + 0.15,
      0.15,
      theme.grid,
    );
    // Without extra bands, the first hour rule also closes the date row.
    if (bandHeight || weatherHeight)
      shape(
        "Day header bottom rule",
        gridX - 0.075,
        bandTop,
        gridWidth + 0.15,
        0.15,
        theme.grid,
      );
    if (weatherHeight && bandHeight)
      shape(
        "Weather band top rule",
        gridX - 0.075,
        weatherTop,
        gridWidth + 0.15,
        0.15,
        theme.grid,
      );
    for (let hour = hourRange.start; hour <= hourRange.end; hour++) {
      const y = top + ((hour - hourRange.start) * height) / hours;
      shape(
        `Hour ${hour} rule`,
        gridX - 0.075,
        y,
        gridWidth + 0.15,
        0.15,
        theme.grid,
      );
      if (hour < hourRange.end) {
        const hourText = formatCalendarHour(hour, style.timeFormat);
        for (const [column, day] of dayIndices.entries())
          text(
            `${dates[day]} Hour ${hour} label`,
            hourText,
            gridX + column * width + 0.65,
            y,
            hourGutter - 1.3,
            Math.min(timedLineHeight, top + height - y),
            6,
            "DM Sans",
            theme.muted,
            "right",
            1.2,
            "center",
          );
        shape(
          `Hour ${hour} half-hour rule`,
          gridX - 0.075,
          y + rowHeight,
          gridWidth + 0.15,
          0.15,
          theme.grid,
        );
      }
    }
    for (let column = 0; column <= dayIndices.length; column++)
      shape(
        `Day column rule ${column}`,
        gridX + column * width - 0.075,
        headerTop,
        0.15,
        195 - headerTop,
        theme.grid,
      );
    const entries = segments
      .filter((segment) => dayIndices.includes(segment.day))
      .map((segment) => ({
        segment,
        x:
          gridX +
          dayIndices.indexOf(segment.day) * width +
          hourGutter +
          0.6 +
          (segment.lane * (width - hourGutter - 1.2)) / segment.lanes,
        w: (width - hourGutter - 1.2) / segment.lanes - 0.4,
        y: top + ((segment.start / 60 - hourRange.start) / hours) * height,
        h: ((segment.end - segment.start) / 60 / hours) * height,
      }));
    for (const { segment, x, w, y, h } of entries) {
      const n = numbers.get(segment.event);
      const label = `${formatCalendarTime(segment.originalStart, style.timeFormat)}–${formatCalendarTime(segment.originalEnd, style.timeFormat)} · ${title(segment.event)}`;
      const size = style.fontSize;
      const lineHeight = timedLineHeight;
      const labelRegion = { x: x + 0.8, width: w - 1.6 };
      const labelWidth = labelRegion.width;
      // Wrap into unused space in this lane, even beyond the event's duration.
      // Only the next overlapping entry or the paper edge limits the title.
      const labelY = y;
      const nextLabelY = Math.min(
        top + height,
        ...entries
          .filter(
            (other) =>
              other.y > y + 0.001 &&
              other.x < labelRegion.x + labelWidth &&
              other.x + other.w > labelRegion.x,
          )
          .map((other) => other.y),
      );
      const availableHeight = Math.min(
        top + height - labelY,
        nextLabelY - labelY,
      );
      const visibleLines = Math.max(
        0,
        Math.floor((availableHeight + 0.001) / lineHeight),
      );
      const result = compact(
        title(segment.event),
        labelWidth,
        visibleLines,
        size,
        options.measureText,
      );
      if (visibleLines > 0 && labelWidth > 3) {
        const labelHeight = result.lines * lineHeight;
        needsKey ||= result.shortened;
        text(
          `Event ${n} label · ${label}`,
          result.text,
          labelRegion.x,
          labelY,
          labelWidth,
          labelHeight,
          size,
          font,
          theme.ink,
          style.textAlign,
          timedLineSpacing,
          "ruled",
        );
        const bottomGap = Math.min(style.arrowPadding, h / 4);
        const arrowEnd = y + h - bottomGap;
        const arrowY = labelY + labelHeight + 0.8;
        const arrowHeight = arrowEnd - arrowY;
        // The grid is ruled every half hour: two ruled rows equal one hour.
        const minimumArrowHeight = height / hours;
        if (arrowHeight + 0.001 >= minimumArrowHeight) {
          const arrowWidth = Math.min(2.5, Math.max(0.5, w - 1));
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
              height: arrowHeight,
              fill: weeklyThemes.mono.muted,
              locked: false,
            }),
          );
        }
      } else {
        needsKey = true;
      }
      needsKey ||=
        segment.clockAdjusted ||
        segment.continuesBefore ||
        segment.continuesAfter;
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
        return `${local.toPlainDate()} ${formatCalendarTime(local.hour * 60 + local.minute, style.timeFormat)} (UTC${local.offset})`;
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
