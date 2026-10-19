import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { arrowSeedFromKey, arrowStyleChange } from "../src/data/arrows";
import { createObject, normaliseDocument } from "../src/data/model";
import { newDocument } from "../src/data/templates";
import {
  newWeeklyDocument,
  sampleWeek,
  weeklyStyleSchema,
} from "../src/data/weekly";
import { ObjectArtwork } from "../src/components/paper/art";
import { handdrawnArrowGeometry } from "../src/components/paper/arrow";

const artwork = (object: ReturnType<typeof createObject>) =>
  renderToStaticMarkup(createElement(ObjectArtwork, { object, assets: {} }));
const coordinates = (path: string) =>
  (path.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);

describe("arrow styles", () => {
  it("keeps legacy arrows regular without a document version migration", () => {
    const doc = newDocument();
    doc.pages[0].objects.push(createObject("shape", { shape: "arrow" }));
    const backup = JSON.parse(JSON.stringify(doc));
    delete backup.pages[0].objects[0].arrowStyle;
    delete backup.pages[0].objects[0].arrowSeed;
    delete backup.pages[0].objects[0].arrowRoughness;
    const restored = normaliseDocument(backup);
    expect(restored.version).toBe(1);
    expect(restored.pages[0].objects[0].arrowStyle).toBe("regular");
    expect(restored.pages[0].objects[0].arrowRoughness).toBe(0.6);
    expect(artwork(restored.pages[0].objects[0])).toContain(
      'data-arrow-style="regular"',
    );
    expect(artwork(restored.pages[0].objects[0])).toContain(' Z"');
  });

  it("validates roughness for objects, calendar settings and imported documents", () => {
    expect(weeklyStyleSchema.parse({}).arrowRoughness).toBe(0.6);
    for (const arrowRoughness of [0, 0.6, 1.5, 3]) {
      expect(createObject("shape", { arrowRoughness }).arrowRoughness).toBe(
        arrowRoughness,
      );
      expect(weeklyStyleSchema.parse({ arrowRoughness }).arrowRoughness).toBe(
        arrowRoughness,
      );
    }
    for (const arrowRoughness of [-0.1, 3.1, Infinity, NaN, "1", null]) {
      expect(weeklyStyleSchema.safeParse({ arrowRoughness }).success).toBe(
        false,
      );
      const doc = newDocument();
      doc.pages[0].objects = [createObject("shape", { shape: "arrow" })];
      const imported = JSON.parse(JSON.stringify(doc));
      imported.pages[0].objects[0].arrowRoughness = arrowRoughness;
      expect(() => normaliseDocument(imported)).toThrow();
    }
  });

  it("adjusts only pen geometry with roughness and restores the same drawing at each value", () => {
    const object = createObject("shape", {
      shape: "arrow",
      arrowStyle: "handdrawn",
      arrowSeed: 42,
      width: 2.5,
      height: 40,
    });
    const paths = [0, 0.6, 3].map(
      (roughness) => handdrawnArrowGeometry(2.5, 40, 42, roughness).paths,
    );
    expect(new Set(paths.map((path) => JSON.stringify(path))).size).toBe(3);
    expect(handdrawnArrowGeometry(2.5, 40, 42).paths).toEqual(paths[1]);
    for (const arrowRoughness of [0, 0.6, 3]) {
      const svg = artwork({ ...object, arrowRoughness });
      expect(svg).toContain(
        handdrawnArrowGeometry(2.5, 40, 42, arrowRoughness).paths[0],
      );
      expect(artwork({ ...object, arrowRoughness })).toBe(svg);
    }
    expect(
      artwork({ ...object, arrowStyle: "regular", arrowRoughness: 0 }),
    ).toBe(artwork({ ...object, arrowStyle: "regular", arrowRoughness: 3 }));
  });

  it("validates styles and requires finite, nonzero 31-bit integer seeds", () => {
    expect(weeklyStyleSchema.parse({}).arrowStyle).toBe("regular");
    expect(
      weeklyStyleSchema.parse({ arrowStyle: "handdrawn" }).arrowStyle,
    ).toBe("handdrawn");
    expect(weeklyStyleSchema.safeParse({ arrowStyle: "sketch" }).success).toBe(
      false,
    );
    expect(() =>
      createObject("shape", { arrowStyle: "sketch" as never }),
    ).toThrow();
    for (const arrowSeed of [0, -1, 1.5, 2 ** 31, Infinity, NaN, "42"])
      expect(() =>
        createObject("shape", { arrowSeed: arrowSeed as number }),
      ).toThrow();
    for (const arrowSeed of [1, 2 ** 31 - 1])
      expect(createObject("shape", { arrowSeed }).arrowSeed).toBe(arrowSeed);
  });

  it("keeps the same drawing through style toggles, duplication and backup validation", () => {
    const original = createObject("shape", {
      shape: "arrow",
      width: 2.5,
      height: 35,
      arrowRoughness: 2.4,
    });
    const pen = createObject("shape", {
      ...original,
      ...arrowStyleChange(original, "handdrawn"),
    });
    const regular = { ...pen, ...arrowStyleChange(pen, "regular") };
    const again = { ...regular, ...arrowStyleChange(regular, "handdrawn") };
    const duplicate = createObject("shape", {
      ...pen,
      id: "duplicate",
      x: pen.x + 5,
    });
    expect(original.arrowSeed).toBeUndefined();
    expect(pen.arrowSeed).toBe(arrowSeedFromKey(original.id));
    expect(artwork(again)).toBe(artwork(pen));
    expect(artwork(duplicate)).toBe(artwork(pen));
    const doc = newDocument();
    doc.pages[0].objects = [pen, duplicate];
    const restored = normaliseDocument(JSON.parse(JSON.stringify(doc)));
    expect(restored).toEqual(doc);
    expect(artwork(restored.pages[0].objects[0])).toBe(artwork(pen));
    const withoutSeed = { ...pen, arrowSeed: undefined };
    expect(artwork(withoutSeed)).toBe(artwork(pen));
    const copied = createObject("shape", {
      ...withoutSeed,
      ...arrowStyleChange(withoutSeed, "handdrawn"),
      id: "copy-without-original-seed",
    });
    expect(artwork(copied)).toBe(artwork(pen));
  });

  it("uses deterministic paths and an open pen arrowhead without needing a DOM", () => {
    const seed = arrowSeedFromKey("a little week");
    const first = handdrawnArrowGeometry(2.5, 40, seed);
    expect(handdrawnArrowGeometry(2.5, 40, seed)).toEqual(first);
    expect(handdrawnArrowGeometry(2.5, 40, seed + 1)).not.toEqual(first);
    expect(first.paths).toHaveLength(2);
    expect(first.paths.every((path) => !/z/i.test(path))).toBe(true);
    expect(coordinates(first.paths[0]).slice(0, 2)).toEqual([
      1.25,
      first.stroke / 2,
    ]);
    expect(coordinates(first.paths[0]).slice(-2)).toEqual([
      1.25,
      40 - first.stroke / 2,
    ]);
    const pen = createObject("shape", {
      shape: "arrow",
      arrowStyle: "handdrawn",
      arrowSeed: seed,
      width: 2.5,
      height: 40,
      fill: "#707770",
      rotation: 25,
      opacity: 0.6,
    });
    const svg = artwork(pen);
    expect(svg).toContain('stroke="#707770"');
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).toContain('stroke-linejoin="round"');
    expect(svg.match(/fill="none"/g)).toHaveLength(2);
    expect(svg).toBe(
      artwork({ ...pen, x: 50, y: 90, rotation: 45, opacity: 1 }),
    );
    expect(artwork({ ...pen, fill: "#ff0000" })).toContain(first.paths[0]);
  });

  it.each([
    [0.01, 0.02],
    [0.1, 1000],
    [0.5, 1000],
    [2.5, 0.5],
    [2.5, 25],
    [2.5, 150],
    [1000, 1000],
  ])(
    "contains the stroke within %s × %s mm without clipping the arrowhead",
    (width, height) => {
      for (const seed of [1, 42, 2 ** 31 - 1]) {
        for (const roughness of [0, 0.6, 3]) {
          const { paths, stroke } = handdrawnArrowGeometry(
            width,
            height,
            seed,
            roughness,
          );
          for (const path of paths) {
            const values = coordinates(path);
            expect(values.length).toBeGreaterThan(2);
            values.forEach((value, index) => {
              expect(Number.isFinite(value)).toBe(true);
              expect(value - stroke / 2).toBeGreaterThanOrEqual(-1e-9);
              expect(value + stroke / 2).toBeLessThanOrEqual(
                (index % 2 ? height : width) + 1e-9,
              );
            });
          }
        }
      }
    },
  );

  it("changes calendar arrow artwork without changing durations, positions or cutoff rules", () => {
    const options = {
      week: "2026-10-05",
      timeZone: "America/New_York",
      theme: "botanical" as const,
      privateTitles: false,
      locations: false,
      eventKey: true,
    };
    const events = sampleWeek(options.week, options.timeZone);
    const arrows = (doc: ReturnType<typeof newWeeklyDocument>["document"]) =>
      doc.pages
        .flatMap((page) => page.objects)
        .filter((object) => object.shape === "arrow");
    const regular = arrows(newWeeklyDocument(events, options).document);
    const pen = arrows(
      newWeeklyDocument(events, {
        ...options,
        arrowStyle: "handdrawn",
        arrowRoughness: 2.4,
      }).document,
    );
    const regenerated = arrows(
      newWeeklyDocument(events, {
        ...options,
        arrowStyle: "handdrawn",
        textAlign: "right",
      }).document,
    );
    expect(pen.length).toBeGreaterThan(0);
    expect(pen).toHaveLength(regular.length);
    expect(new Set(pen.map((arrow) => arrow.arrowSeed)).size).toBe(pen.length);
    pen.forEach((arrow, index) => {
      expect(arrow.arrowStyle).toBe("handdrawn");
      expect(arrow.arrowRoughness).toBe(2.4);
      expect(arrow.arrowSeed).toBe(regenerated[index].arrowSeed);
      for (const field of [
        "x",
        "y",
        "width",
        "height",
        "fill",
        "rotation",
        "opacity",
      ] as const)
        expect(arrow[field]).toBe(regular[index][field]);
    });
    expect(regular.every((arrow) => arrow.arrowStyle === "regular")).toBe(true);
  });
});
