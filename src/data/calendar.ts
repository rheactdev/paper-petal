import { createObject, type Page, type PaperObject } from "./model";

export type WeekStart = 0 | 1;
export type CalendarMonth = {
  year: number;
  month: number;
  monthName: string;
  title: string;
  weekdays: string[];
  weeks: (number | null)[][];
};

export function calendarMonth(
  date = new Date(),
  weekStart: WeekStart = 1,
): CalendarMonth {
  if (!Number.isFinite(date.getTime()))
    throw new Error("Choose a valid calendar month.");
  const year = date.getFullYear(),
    month = date.getMonth();
  const first = new Date(year, month, 1, 12);
  const days = new Date(year, month + 1, 0, 12).getDate();
  const offset = (first.getDay() - weekStart + 7) % 7;
  const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(
    date,
  );
  return {
    year,
    month,
    monthName,
    title: `${monthName} ${year}`,
    weekdays: Array.from(
      { length: 7 },
      (_, i) => weekdays[(i + weekStart) % 7],
    ),
    weeks: Array.from({ length: Math.ceil((offset + days) / 7) }, (_, row) =>
      Array.from({ length: 7 }, (_, column) => {
        const day = row * 7 + column - offset + 1;
        return day >= 1 && day <= days ? day : null;
      }),
    ),
  };
}

export function calendarPages(month: CalendarMonth, count: 1 | 2): Page[] {
  const ink = "#485541",
    muted = "#6d7e5d",
    line = "#aab59b";
  const grid = {
    x: 12.2,
    y: 47,
    width: 123.6,
    height: count === 1 ? 120 : 142,
  };
  const thickness = 0.2;
  const rowHeight = grid.height / month.weeks.length;
  const dateKey = (day: number) =>
    `${month.year}-${String(month.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return Array.from({ length: count }, (_, pageIndex) => {
    const objects: PaperObject[] = [];
    function text(
      label: string,
      words: string,
      x: number,
      y: number,
      width: number,
      height: number,
      size = 9,
      font: PaperObject["font"] = "DM Sans",
      color = ink,
    ) {
      objects.push(
        createObject("text", {
          label,
          text: words,
          x,
          y,
          width,
          height,
          font,
          fontSize: size,
          color,
        }),
      );
    }
    function shape(
      label: string,
      x: number,
      y: number,
      width: number,
      height: number,
      fill = line,
    ) {
      objects.push(
        createObject("shape", {
          label,
          x,
          y,
          width,
          height,
          fill,
          locked: true,
        }),
      );
    }
    text("Month heading", month.monthName, 12, 12, 124, 16, 28, "Lora");
    text(
      "Calendar year and layout",
      `${month.year}  ·  ${count === 1 ? "a month at a glance" : pageIndex === 0 ? "a little room for every day" : "the rest of the week + little notes"}`,
      12,
      31,
      124,
      6,
      9,
      "DM Sans",
      muted,
    );
    const columns =
      count === 1
        ? [0, 1, 2, 3, 4, 5, 6]
        : pageIndex === 0
          ? [0, 1, 2, 3]
          : [4, 5, 6, null];
    const columnWidth = grid.width / columns.length;
    columns.forEach((dayColumn, column) => {
      const x = grid.x + column * columnWidth;
      const name = dayColumn === null ? "NOTES" : month.weekdays[dayColumn];
      text(
        `${name} column heading`,
        name,
        x + 1.5,
        40,
        columnWidth - 3,
        5,
        count === 1 ? 7.5 : 9,
        "DM Sans",
        muted,
      );
      if (name === "SAT" || name === "SUN" || name === "NOTES")
        shape(
          `${name} column tint`,
          x,
          grid.y,
          columnWidth,
          grid.height,
          "#f0f2e9",
        );
    });
    for (let row = 0; row <= month.weeks.length; row++)
      shape(
        `Calendar horizontal rule ${row + 1}`,
        grid.x - thickness / 2,
        grid.y + row * rowHeight - thickness / 2,
        grid.width + thickness,
        thickness,
      );
    for (let column = 0; column <= columns.length; column++)
      shape(
        `Calendar vertical rule ${column + 1}`,
        grid.x + column * columnWidth - thickness / 2,
        grid.y - thickness / 2,
        thickness,
        grid.height + thickness,
      );
    month.weeks.forEach((week, row) => {
      columns.forEach((dayColumn, column) => {
        const x = grid.x + column * columnWidth,
          y = grid.y + row * rowHeight;
        if (dayColumn === null) {
          text(
            `Week ${row + 1} notes`,
            "",
            x + 1.5,
            y + 2,
            columnWidth - 3,
            rowHeight - 4,
            9,
          );
          return;
        }
        const day = week[dayColumn];
        if (day === null) return;
        text(
          `${dateKey(day)} date`,
          String(day),
          x + 1.5,
          y + 1,
          columnWidth - 3,
          6,
          count === 1 ? 9 : 11,
          "Lora",
        );
        text(
          `${dateKey(day)} entry`,
          "",
          x + 1.5,
          y + 8,
          columnWidth - 3,
          rowHeight - 10,
          count === 1 ? 8 : 9,
        );
      });
    });
    if (count === 1) {
      text(
        "Monthly notes heading",
        "LITTLE NOTES & INTENTIONS",
        12,
        175,
        124,
        5,
        8,
        "DM Sans",
        muted,
      );
      shape("Monthly notes underline", 12, 181, 124, thickness);
      text("Monthly notes", "", 12, 183, 124, 14, 10);
    } else {
      text(
        "Calendar footer",
        "one little thing at a time",
        12,
        191,
        124,
        7,
        12,
        "Caveat",
        "#927156",
      );
    }
    return { id: crypto.randomUUID(), objects };
  });
}
