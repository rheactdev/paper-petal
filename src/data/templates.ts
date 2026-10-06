import { createObject, type PaperDocument, type RichNode } from "./model";
import { calendarMonth, calendarPages, type WeekStart } from "./calendar";
const paragraph = (text: string): RichNode => ({
  type: "paragraph",
  content: text ? [{ type: "text", text }] : undefined,
});
const heading = (text: string): RichNode => ({
  type: "heading",
  attrs: { level: 1 },
  content: [{ type: "text", text }],
});
export function newDocument(
  template = "blank",
  options: { now?: Date; weekStart?: WeekStart } = {},
): PaperDocument {
  const date = options.now ?? new Date();
  const now = date.toISOString();
  const doc: PaperDocument = {
    version: 1,
    id: crypto.randomUUID(),
    title:
      template === "journal"
        ? "Little moments"
        : template === "collage"
          ? "Collected memories"
          : template === "planner"
            ? "A gentle week"
            : "Untitled document",
    createdAt: now,
    updatedAt: now,
    paper: {
      width: 148,
      height: 210,
      margins: { top: 18, bottom: 12, inner: 12, outer: 12 },
      background: "#fffdf7",
      pattern: "plain",
    },
    typography: { font: "Lora", size: 11, color: "#485541" },
    flow: { type: "doc", content: [paragraph("")] },
    pages: [{ id: crypto.randomUUID(), objects: [] }],
  };
  if (template === "blank") doc.paper.margins.top = 12;
  if (template === "calendar" || template === "calendar-spread") {
    const month = calendarMonth(date, options.weekStart ?? 1);
    const count = template === "calendar" ? 1 : 2;
    doc.title = `${month.title} · ${count === 1 ? "monthly calendar" : "calendar spread"}`;
    doc.paper.margins.top = 12;
    doc.pages = calendarPages(month, count);
  }
  if (template === "journal") {
    doc.flow.content = [
      heading("Little moments"),
      paragraph("A place to gather the things I want to remember."),
      paragraph("Today, I’m making room for…"),
      paragraph(""),
    ];
    doc.pages[0].objects = [
      createObject("sticker", {
        x: 111,
        y: 150,
        width: 22,
        height: 38,
        sticker: "leaf",
        label: "Botanical sprig",
        color: "#75846a",
      }),
      createObject("text", {
        x: 14,
        y: 168,
        width: 100,
        height: 17,
        text: "notice the small, lovely things",
        font: "Caveat",
        fontSize: 18,
        color: "#9a765b",
        label: "Handwritten reminder",
      }),
    ];
  }
  if (template === "collage") {
    doc.flow.content = [
      heading("Collected memories"),
      paragraph("The moments that made this season feel like mine."),
      paragraph(""),
    ];
    doc.pages[0].objects = [
      createObject("shape", {
        x: 15,
        y: 64,
        width: 55,
        height: 67,
        fill: "#e5e9da",
        label: "Photo space one",
        rotation: -5,
      }),
      createObject("shape", {
        x: 79,
        y: 79,
        width: 54,
        height: 67,
        fill: "#e9dfd5",
        label: "Photo space two",
        rotation: 5,
      }),
      createObject("sticker", {
        x: 31,
        y: 60,
        width: 27,
        height: 8,
        sticker: "tape",
        label: "Washi tape",
        rotation: -5,
      }),
      createObject("text", {
        x: 29,
        y: 155,
        width: 91,
        height: 24,
        text: "a few things worth keeping ♡",
        font: "Caveat",
        fontSize: 20,
        label: "Memory caption",
      }),
    ];
  }
  if (template === "planner") {
    doc.flow.content = [
      heading("A gentle week"),
      paragraph("One thing at a time. Leave space for yourself."),
      ...[
        "MONDAY",
        "TUESDAY",
        "WEDNESDAY",
        "THURSDAY",
        "FRIDAY",
        "A LITTLE JOY",
      ].flatMap((day) => [
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: day }],
        } as RichNode,
        paragraph("________________________________"),
      ]),
    ];
    doc.typography.size = 10;
    doc.pages[0].objects = [
      createObject("sticker", {
        x: 118,
        y: 15,
        width: 13,
        height: 13,
        sticker: "flower",
        label: "Flower",
        color: "#ad846e",
      }),
    ];
  }
  return doc;
}
