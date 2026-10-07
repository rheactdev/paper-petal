import { describe, expect, it, vi } from "vitest";
import {
  cornerPoint,
  geometryOf,
  normalizeAngle,
  resizeCursor,
  resizeObject,
  rotateObject,
  type ResizeCorner,
} from "../src/editor/object-geometry";
import { trackObjectGesture } from "../src/components/paper/object-gesture";

const original = { x: 30, y: 50, width: 25, height: 15, rotation: 0 };
const opposites = { tl: "br", tr: "bl", bl: "tr", br: "tl" } as const;
describe("canvas object transformations", () => {
  it.each([0, 30, 90, 135, -170])(
    "keeps the opposite corner fixed when resizing at %s degrees",
    (rotation) => {
      for (const corner of Object.keys(opposites) as ResizeCorner[]) {
        const object = { ...original, rotation },
          anchor = cornerPoint(object, opposites[corner]);
        const next = resizeObject(object, corner, { x: 8, y: 6 }, false);
        const nextAnchor = cornerPoint(next, opposites[corner]);
        expect(nextAnchor.x).toBeCloseTo(anchor.x);
        expect(nextAnchor.y).toBeCloseTo(anchor.y);
        expect(next.rotation).toBe(rotation);
      }
    },
  );
  it("preserves PNG proportions while growing or shrinking and never flips through zero", () => {
    const next = resizeObject(original, "br", { x: 25, y: 15 }, true);
    expect(next).toMatchObject({ x: 30, y: 50, width: 50, height: 30 });
    const small = resizeObject(original, "br", { x: -1000, y: -1000 }, true);
    expect(small.width / small.height).toBeCloseTo(25 / 15);
    expect(Math.min(small.width, small.height)).toBeCloseTo(1);
    const large = resizeObject(original, "br", { x: 10000, y: 10000 }, true);
    expect(large.width).toBeCloseTo(1000);
    expect(large.width / large.height).toBeCloseTo(25 / 15);
  });
  it("allows free text/shape resizing without stretching a fixed opposite corner", () => {
    expect(resizeObject(original, "tl", { x: -10, y: -5 }, false)).toEqual({
      x: 20,
      y: 45,
      width: 35,
      height: 20,
      rotation: 0,
    });
    const narrow = resizeObject(
      { ...original, width: 0.25 },
      "br",
      { x: 0, y: 0 },
      false,
    );
    expect(narrow.width).toBe(0.25);
  });
  it("uses local axes for an already rotated object", () => {
    const rotated = { ...original, rotation: 90 };
    const next = resizeObject(rotated, "br", { x: -15, y: 25 }, true);
    expect(next.width).toBeCloseTo(50);
    expect(next.height).toBeCloseTo(30);
    expect(cornerPoint(next, "tl").x).toBeCloseTo(cornerPoint(rotated, "tl").x);
    expect(cornerPoint(next, "tl").y).toBeCloseTo(cornerPoint(rotated, "tl").y);
  });
  it("rotates around the centre, snaps with Shift, and crosses the angle seam smoothly", () => {
    const center = { x: 42.5, y: 57.5 };
    expect(
      rotateObject(
        original,
        { x: center.x, y: center.y - 30 },
        { x: center.x + 30, y: center.y },
      ),
    ).toEqual({ ...original, rotation: 90 });
    const anglePoint = (degrees: number) => ({
      x: center.x + 30 * Math.cos((degrees * Math.PI) / 180),
      y: center.y + 30 * Math.sin((degrees * Math.PI) / 180),
    });
    expect(
      rotateObject(original, anglePoint(179), anglePoint(-179)).rotation,
    ).toBeCloseTo(2);
    expect(
      rotateObject(original, anglePoint(0), anglePoint(37), true).rotation,
    ).toBe(30);
    expect(normalizeAngle(370)).toBe(10);
    expect(resizeCursor("br", 0)).toBe("nwse-resize");
    expect(resizeCursor("br", 90)).toBe("nesw-resize");
  });
  it("takes a geometry snapshot independently of subsequent object edits", () => {
    const object = { ...original },
      saved = geometryOf(object);
    object.width = 90;
    expect(saved.width).toBe(25);
  });
});

function pointer(type: string, x: number, y: number, pointerId = 1) {
  return Object.assign(new Event(type, { cancelable: true }), {
    clientX: x,
    clientY: y,
    pointerId,
    shiftKey: false,
  }) as PointerEvent;
}
function gesture() {
  const host = new EventTarget() as Window;
  const callbacks = { move: vi.fn(), finish: vi.fn() };
  const cancel = trackObjectGesture(
    host,
    pointer("pointerdown", 10, 10),
    callbacks,
  );
  return { host, callbacks, cancel };
}
describe("object pointer gesture history boundaries", () => {
  it("previews continuous changes and finishes once, including the final pointer position", () => {
    const { host, callbacks } = gesture();
    for (const x of [15, 20, 30])
      host.dispatchEvent(pointer("pointermove", x, 40));
    expect(callbacks.finish).not.toHaveBeenCalled();
    host.dispatchEvent(pointer("pointerup", 50, 50));
    host.dispatchEvent(pointer("pointerup", 50, 50));
    expect(callbacks.move.mock.calls.at(-1)?.[0]).toMatchObject({
      clientX: 50,
      clientY: 50,
    });
    expect(callbacks.finish).toHaveBeenCalledExactlyOnceWith(false, true);
  });
  it("does not record a click as a geometry change", () => {
    const { host, callbacks } = gesture();
    host.dispatchEvent(pointer("pointermove", 11, 11));
    host.dispatchEvent(pointer("pointerup", 11, 11));
    expect(callbacks.move).not.toHaveBeenCalled();
    expect(callbacks.finish).toHaveBeenCalledExactlyOnceWith(false, false);
  });
  it.each(["Escape", "pointercancel", "blur", "unmount"])(
    "cancels %s without committing and removes listeners",
    (reason) => {
      const { host, callbacks, cancel } = gesture();
      host.dispatchEvent(pointer("pointermove", 30, 30));
      if (reason === "Escape")
        host.dispatchEvent(
          Object.assign(new Event("keydown"), { key: "Escape" }),
        );
      if (reason === "pointercancel")
        host.dispatchEvent(pointer("pointercancel", 30, 30));
      if (reason === "blur") host.dispatchEvent(new Event("blur"));
      if (reason === "unmount") cancel();
      host.dispatchEvent(pointer("pointermove", 50, 50));
      host.dispatchEvent(pointer("pointerup", 50, 50));
      expect(callbacks.move).toHaveBeenCalledTimes(1);
      expect(callbacks.finish).toHaveBeenCalledExactlyOnceWith(true, true);
    },
  );
  it("ignores other pointers during an active mouse gesture", () => {
    const { host, callbacks } = gesture();
    host.dispatchEvent(pointer("pointermove", 50, 50, 2));
    host.dispatchEvent(pointer("pointercancel", 50, 50, 2));
    expect(callbacks.move).not.toHaveBeenCalled();
    expect(callbacks.finish).not.toHaveBeenCalled();
    host.dispatchEvent(pointer("pointerup", 10, 10));
    expect(callbacks.finish).toHaveBeenCalledExactlyOnceWith(false, false);
  });
});
