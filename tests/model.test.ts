import { describe, it, expect } from "vitest";
import { newDocument } from "../src/data/templates";
import { paperFonts } from "../src/data/fonts";
import {
  normaliseDocument,
  cleanRich,
  createObject,
  syncPages,
  pageMargins,
  objectWarnings,
} from "../src/data/model";
describe("documents", () => {
  it("preserves bundled fonts in document typography, text boxes and rich-text backup marks", () => {
    for (const font of paperFonts) {
      const doc = newDocument("blank");
      doc.typography.font = font;
      doc.pages[0].objects.push(
        createObject("text", { font, text: "A little note" }),
      );
      doc.flow = cleanRich({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "A little note",
                marks: [{ type: "textStyle", attrs: { fontFamily: font } }],
              },
            ],
          },
        ],
      });
      expect(
        doc.flow.content?.[0].content?.[0].marks?.[0].attrs?.fontFamily,
      ).toBe(font);
      expect(normaliseDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
    }
    expect(() =>
      createObject("text", { font: "Unbundled" as never }),
    ).toThrow();
  });
  it("creates valid templates with editable content", () => {
    for (const id of [
      "blank",
      "journal",
      "collage",
      "planner",
      "calendar",
      "calendar-spread",
    ]) {
      const doc = newDocument(id);
      expect(normaliseDocument(doc)).toEqual(doc);
      expect(doc.paper.width).toBe(148);
      expect(doc.paper.height).toBe(210);
    }
  });
  it("preserves legacy text spacing and validates compact spacing in document backups", () => {
    const doc = newDocument("blank");
    doc.pages[0].objects.push(createObject("text"));
    const text = createObject("text", { lineHeight: 1.2 });
    doc.pages[0].objects.push(text);
    const backup = JSON.parse(JSON.stringify(doc));
    delete backup.pages[0].objects[0].lineHeight;
    const restored = normaliseDocument(backup);
    expect(restored.pages[0].objects[0].lineHeight).toBe(1.5);
    expect(restored.pages[0].objects.at(-1)?.lineHeight).toBe(1.2);
    for (const lineHeight of [0, 3.1, "1.2", Infinity]) {
      expect(() =>
        createObject("text", { lineHeight: lineHeight as number }),
      ).toThrow();
    }
  });
  it("defaults older text boxes to left alignment and retains validated alignment through backups", () => {
    const doc = newDocument("blank");
    doc.pages[0].objects.push(createObject("text"));
    const legacy = JSON.parse(JSON.stringify(doc));
    delete legacy.pages[0].objects[0].textAlign;
    expect(normaliseDocument(legacy).pages[0].objects[0].textAlign).toBe(
      "left",
    );
    for (const textAlign of ["left", "center", "right"] as const) {
      doc.pages[0].objects[0].textAlign = textAlign;
      expect(
        normaliseDocument(JSON.parse(JSON.stringify(doc))).pages[0].objects[0]
          .textAlign,
      ).toBe(textAlign);
    }
    expect(() =>
      createObject("text", { textAlign: "invalid" as never }),
    ).toThrow();
  });
  it("defaults to 12 mm margins and mirrors inner/outer", () => {
    const doc = newDocument();
    expect(doc.paper.margins).toEqual({
      top: 12,
      bottom: 12,
      inner: 12,
      outer: 12,
    });
    doc.paper.margins.inner = 18;
    expect(pageMargins(doc, 0).left).toBe(18);
    expect(pageMargins(doc, 1).right).toBe(18);
  });
  it("rejects unusable margins and unknown rich-text nodes", () => {
    const doc = newDocument();
    doc.paper.margins.inner = 140;
    expect(() => normaliseDocument(doc)).toThrow();
    const invalid = newDocument();
    invalid.flow = { type: "doc", content: [{ type: "script", text: "bad" }] };
    expect(() => normaliseDocument(invalid)).toThrow();
  });
  it("rejects unsafe styles and invalid text trees", () => {
    const doc = newDocument();
    doc.flow = { type: "doc", content: [{ type: "text", text: "orphan" }] };
    expect(() => normaliseDocument(doc)).toThrow();
    const invalid = newDocument();
    invalid.flow = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "x",
              marks: [
                {
                  type: "textStyle",
                  attrs: { color: "url(javascript:alert(1))" },
                },
              ],
            },
          ],
        },
      ],
    };
    expect(() => normaliseDocument(invalid)).toThrow();
  });
  it("normalises editor null attributes and pasted RGB colour", () => {
    expect(
      cleanRich({
        type: "paragraph",
        attrs: { textAlign: null },
        content: [
          {
            type: "text",
            text: "safe",
            marks: [
              {
                type: "textStyle",
                attrs: {
                  color: "rgb(10, 20, 30)",
                  fontFamily: "Unknown",
                  fontSize: null,
                },
              },
            ],
          },
        ],
      }).content?.[0].marks?.[0].attrs,
    ).toEqual({ color: "#0a141e" });
  });
  it("preserves decorated pages when flowing content shrinks", () => {
    const pages = newDocument().pages;
    const ids = pages.map((p) => p.id);
    const expanded = syncPages(pages, 4);
    expanded[2].objects.push(createObject("sticker"));
    const shrunk = syncPages(expanded, 1);
    expect(shrunk).toHaveLength(3);
    expect(shrunk[0].id).toBe(ids[0]);
    expect(shrunk[2].id).toBe(expanded[2].id);
  });
  it("warns about rotation, paper bounds, margins and overlap", () => {
    const doc = newDocument("journal");
    const outside = createObject("text", { x: 140, width: 20 });
    expect(objectWarnings(doc, 0, outside)).toContain(
      "Extends beyond the paper",
    );
    const overlapping = createObject("shape", { x: 20, y: 35 });
    expect(objectWarnings(doc, 0, overlapping)).toContain(
      "May overlap flowing text",
    );
    const rotated = createObject("shape", { x: 0, y: 0, rotation: 45 });
    expect(objectWarnings(doc, 0, rotated)).toContain(
      "Extends beyond the paper",
    );
  });
  it("retains rich text and object properties in serialisation", () => {
    const doc = newDocument("journal");
    doc.pages[0].objects[0].locked = true;
    expect(normaliseDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });
});
