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
    showHours: page === 0,
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
  measureHeading?: MeasurePaperText;
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
  const monthWidth = options.measureHeading?.(month, 12) ?? 24;
  const detailsX = 12 + monthWidth + 2;
  const doc = newDocument("blank");
  doc.paper.margins.inner = 10;
  doc.paper.margins.outer = 10;
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
    const {
      days: dayIndices,
      gridX,
      columnWidth: width,
      gridWidth,
      showHours,
    } = weeklyPageLayout(pageIndex);
    const allDayRows = Math.min(
      3,
      Math.max(...dates.map((date) => eventsOnDate(relevant, date).length)),
    );
    const allDayTextHeight = style.fontSize * 0.3528 * 1.2 * 2 + 0.15;
    const allDayRowHeight = Math.max(7.5, allDayTextHeight + 0.8);
    const bandTop = 31,
      bandHeight = allDayRows * allDayRowHeight;
    const top = bandTop + (bandHeight ? bandHeight + 1 : 0),
      height = 195 - top;
    const hours = hourRange.end - hourRange.start;
    text("Month heading", month, 12, 12, monthWidth + 0.3, 6, 12, "Lora");
    text(
      "Week and time zone",
      `·  ${dates[0]} — ${dates[6]}  ·  ${options.timeZone}`,
      detailsX,
      14,
      136 - detailsX,
      4,
      7,
      "DM Sans",
      theme.muted,
    );
    if (pageIndex === 0) {
      // The spare 1.25-inch column holds a mini month and notes. Its rightmost
      // 6 mm remains clear for the shared timeline labels beside Monday.
      const sideX = 10.5,
        sideWidth = WEEKLY_COLUMN_WIDTH_MM - 6;
      const first = Temporal.PlainDate.from(dates[0]).with({ day: 1 });
      const offset = first.dayOfWeek - 1;
      const cellWidth = sideWidth / 7;
      text(
        "Mini month heading",
        `${month.toUpperCase()} ${first.year}`,
        sideX,
        24,
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
          29,
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
          y = 33 + row * 3.8;
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
      text(
        "Weekly notes heading",
        "LITTLE NOTES",
        sideX,
        62,
        sideWidth,
        3.5,
        6.5,
        "DM Sans",
        theme.muted,
      );
      const notesTop = 68,
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
      // Measuring its text leaves the remaining width available for the date.
      const weatherWidth =
        (options.measureLabels?.(weatherText, 6) ??
          weatherText.length * 6 * 0.3528 * 0.6) + 0.5;
      const weatherX = x + width - 1.3 - weatherWidth;
      const iconX = weatherX - 0.6 - 3;
      text(
        `${dates[day]} day heading`,
        `${weekdays[day]}  ${dates[day].slice(8)}`,
        x + 1.3,
        24,
        options.weather
          ? (forecast ? iconX : weatherX) - 0.6 - (x + 1.3)
          : width - 2.6,
        4.5,
        options.weather ? 7.5 : 8.5,
        "DM Sans",
        day > 4 && options.theme !== "mono" ? "#996d5a" : theme.ink,
      );
      if (options.weather) {
        text(
          `${dates[day]} weather estimate · ${forecast ? weatherDescription(forecast.code) : "Unavailable"}`,
          weatherText,
          weatherX,
          24.25,
          weatherWidth,
          3.5,
          6,
          "DM Sans",
          theme.muted,
          "right",
        );
        if (forecast)
          objects.push(
            createObject("sticker", {
              label: `${dates[day]} weather icon · ${weatherDescription(forecast.code)}`,
              sticker: weatherIcon(forecast.code),
              x: iconX,
              y: 24,
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
        );
    }
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
      if (showHours)
        text(
          `Hour ${hour} label`,
          formatCalendarHour(hour, style.timeFormat),
          gridX - 5.3,
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
          gridX - 0.075,
          y + height / (hours * 2),
          gridWidth + 0.15,
          0.15,
          theme.grid,
        );
    }
    for (let column = 0; column <= dayIndices.length; column++)
      shape(
        `Day column rule ${column}`,
        gridX + column * width - 0.075,
        bandTop,
        0.15,
        195 - bandTop,
        theme.grid,
      );
    const entries = segments
      .filter((segment) => dayIndices.includes(segment.day))
      .map((segment) => ({
        segment,
        x:
          gridX +
          dayIndices.indexOf(segment.day) * width +
          0.6 +
          (segment.lane * (width - 1.2)) / segment.lanes,
        w: (width - 1.2) / segment.lanes - 0.4,
        y: top + ((segment.start / 60 - hourRange.start) / hours) * height,
        h: ((segment.end - segment.start) / 60 / hours) * height,
      }));
    for (const { segment, x, w, y, h } of entries) {
      const n = numbers.get(segment.event);
      const label = `${formatCalendarTime(segment.start, style.timeFormat)}–${formatCalendarTime(segment.end, style.timeFormat)} · ${title(segment.event)}`;
      const size = style.fontSize;
      const lineHeight = size * 0.3528 * 1.2;
      const labelRegion = { x: x + 0.8, width: w - 1.6 };
      const labelWidth = labelRegion.width;
      // Wrap into unused space in this lane, even beyond the event's duration.
      // Only the next overlapping entry or the paper edge limits the title.
      const oneLineHeight = lineHeight + 0.15;
      let labelY = Math.min(y + 0.6, top + height - oneLineHeight);
      const nextLabelY = Math.min(
        top + height + 0.3,
        ...entries
          .filter(
            (other) =>
              other.y > y + 0.001 &&
              other.x < labelRegion.x + labelWidth &&
              other.x + other.w > labelRegion.x,
          )
          .map((other) => Math.min(other.y, top + height - oneLineHeight)),
      );
      // A tightly spaced first appointment can borrow the empty space just
      // above its start. Never move into an earlier appointment or its label.
      if (nextLabelY - labelY - 0.3 < oneLineHeight) {
        const overlaps = (left: number, right: number) =>
          left < labelRegion.x + labelWidth && right > labelRegion.x;
        const earliestY = Math.max(
          top,
          ...entries
            .filter(
              (other) => other.y < y && overlaps(other.x, other.x + other.w),
            )
            .map((other) => other.y + other.h + 0.3),
          ...objects
            .filter(
              (object) =>
                /^Event \d+ label/.test(object.label) &&
                overlaps(object.x, object.x + object.width),
            )
            .map((object) => object.y + object.height + 0.3),
        );
        const earlierY =
          Math.min(top + height, nextLabelY - 0.3) - oneLineHeight;
        if (earlierY >= earliestY && labelY - earlierY <= oneLineHeight)
          labelY = earlierY;
      }
      const availableHeight = Math.min(
        top + height - labelY,
        nextLabelY - labelY - 0.3,
      );
      const visibleLines = Math.max(
        0,
        Math.floor((availableHeight - 0.15 + 0.001) / lineHeight),
      );
      const result = compact(
        title(segment.event),
        labelWidth,
        visibleLines,
        size,
        options.measureText,
      );
      if (visibleLines > 0 && labelWidth > 3) {
        const labelHeight = result.lines * lineHeight + 0.15;
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
