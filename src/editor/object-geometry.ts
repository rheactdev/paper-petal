import type { PaperObject } from "../data/model";

export type Point = { x: number; y: number };
export type ResizeCorner = "tl" | "tr" | "bl" | "br";
export type ObjectGesture = "move" | "rotate" | ResizeCorner;
export type ObjectGeometry = Pick<
  PaperObject,
  "x" | "y" | "width" | "height" | "rotation"
>;
export const cornerSigns: Record<ResizeCorner, Point> = {
  tl: { x: -1, y: -1 },
  tr: { x: 1, y: -1 },
  bl: { x: -1, y: 1 },
  br: { x: 1, y: 1 },
};
function rotate(point: Point, degrees: number): Point {
  const angle = (degrees * Math.PI) / 180;
  return {
    x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
  };
}
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
export function geometryOf(object: ObjectGeometry): ObjectGeometry {
  const { x, y, width, height, rotation } = object;
  return { x, y, width, height, rotation };
}
export function cornerPoint(
  object: ObjectGeometry,
  corner: ResizeCorner,
): Point {
  const sign = cornerSigns[corner];
  const offset = rotate(
    { x: (sign.x * object.width) / 2, y: (sign.y * object.height) / 2 },
    object.rotation,
  );
  return {
    x: object.x + object.width / 2 + offset.x,
    y: object.y + object.height / 2 + offset.y,
  };
}
export function resizeObject(
  object: ObjectGeometry,
  corner: ResizeCorner,
  delta: Point,
  keepRatio: boolean,
): ObjectGeometry {
  const sign = cornerSigns[corner],
    local = rotate(delta, -object.rotation);
  let width: number, height: number;
  if (keepRatio) {
    const factor = clamp(
      1 +
        (sign.x * local.x * object.width + sign.y * local.y * object.height) /
          (object.width ** 2 + object.height ** 2),
      Math.max(
        Math.min(1, object.width) / object.width,
        Math.min(1, object.height) / object.height,
      ),
      Math.min(1000 / object.width, 1000 / object.height),
    );
    width = object.width * factor;
    height = object.height * factor;
  } else {
    width = clamp(
      object.width + sign.x * local.x,
      Math.min(1, object.width),
      1000,
    );
    height = clamp(
      object.height + sign.y * local.y,
      Math.min(1, object.height),
      1000,
    );
  }
  const opposite = ({ tl: "br", tr: "bl", bl: "tr", br: "tl" } as const)[
    corner
  ];
  const anchor = cornerPoint(object, opposite);
  const offset = rotate(
    { x: (sign.x * width) / 2, y: (sign.y * height) / 2 },
    object.rotation,
  );
  return {
    x: anchor.x + offset.x - width / 2,
    y: anchor.y + offset.y - height / 2,
    width,
    height,
    rotation: object.rotation,
  };
}
export function rotateObject(
  object: ObjectGeometry,
  start: Point,
  current: Point,
  snap = false,
): ObjectGeometry {
  const center = {
    x: object.x + object.width / 2,
    y: object.y + object.height / 2,
  };
  const angle = (point: Point) =>
    (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
  const delta = normalizeAngle(angle(current) - angle(start));
  const rotation = snap
    ? Math.round((object.rotation + delta) / 15) * 15
    : object.rotation + delta;
  return { ...geometryOf(object), rotation: normalizeAngle(rotation) };
}
export function normalizeAngle(angle: number) {
  return ((((angle + 180) % 360) + 360) % 360) - 180;
}
export function resizeCursor(corner: ResizeCorner, rotation: number) {
  const sign = cornerSigns[corner];
  const angle = (Math.atan2(sign.y, sign.x) * 180) / Math.PI + rotation;
  return ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"][
    ((Math.round(angle / 45) % 4) + 4) % 4
  ];
}
