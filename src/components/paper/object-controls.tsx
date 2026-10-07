import { RotateCcw } from "lucide-react";
import { MM, type PaperObject } from "../../data/model";
import {
  resizeCursor,
  type ObjectGesture,
  type ResizeCorner,
} from "../../editor/object-geometry";

const names = {
  tl: "top left",
  tr: "top right",
  bl: "bottom left",
  br: "bottom right",
};
export function ObjectControls({
  object,
  offset,
  zoom,
  onPointerDown,
  onKeyDown,
}: {
  object: PaperObject;
  offset: number;
  zoom: number;
  onPointerDown: (
    event: React.PointerEvent<HTMLButtonElement>,
    kind: ObjectGesture,
  ) => void;
  onKeyDown: (
    event: React.KeyboardEvent<HTMLButtonElement>,
    kind: ObjectGesture,
  ) => void;
}) {
  if (object.locked) return null;
  return (
    <div
      className="canvas-object-controls"
      role="group"
      aria-label={`Canvas controls for ${object.label}`}
      style={
        {
          left: offset + object.x * MM,
          top: object.y * MM,
          width: object.width * MM,
          height: object.height * MM,
          transform: `rotate(${object.rotation}deg)`,
          borderWidth: 1 / zoom,
          "--handle-scale": 1 / zoom,
          "--rotation-offset": `${32 / zoom}px`,
        } as React.CSSProperties
      }
    >
      {(Object.keys(names) as ResizeCorner[]).map((corner) => (
        <button
          key={corner}
          type="button"
          className={`canvas-resize-handle ${corner}`}
          style={{ cursor: resizeCursor(corner, object.rotation) }}
          aria-label={`Resize ${object.label} ${names[corner]}`}
          title="Drag to resize. Arrow keys adjust size; Shift uses 10 mm."
          onPointerDown={(event) => onPointerDown(event, corner)}
          onKeyDown={(event) => onKeyDown(event, corner)}
        />
      ))}
      <span className="rotation-stem" aria-hidden="true" />
      <button
        type="button"
        className="canvas-rotate-handle"
        aria-label={`Rotate ${object.label}`}
        title="Drag to rotate. Hold Shift to snap to 15°. Left/Right rotate; Shift uses 15°."
        onPointerDown={(event) => onPointerDown(event, "rotate")}
        onKeyDown={(event) => onKeyDown(event, "rotate")}
      >
        <RotateCcw size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
