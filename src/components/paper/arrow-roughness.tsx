import { useId, useRef } from "react";
import { ARROW_ROUGHNESS } from "../../data/arrows";

/** Live updates share one undo entry for a drag or a held keyboard key. */
export function ArrowRoughness({
  value = ARROW_ROUGHNESS.default,
  onChange,
}: {
  value: number;
  onChange: (value: number, history: boolean) => void;
}) {
  const id = useId();
  const changed = useRef(false);
  const endGesture = () => {
    changed.current = false;
  };
  return (
    <div className="arrow-roughness">
      <label htmlFor={id}>
        Arrow roughness <output htmlFor={id}>{value.toFixed(1)}</output>
      </label>
      <input
        id={id}
        type="range"
        min={ARROW_ROUGHNESS.min}
        max={ARROW_ROUGHNESS.max}
        step={ARROW_ROUGHNESS.step}
        value={value}
        onPointerDown={endGesture}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onKeyDown={(event) => {
          if (!event.repeat) endGesture();
        }}
        onKeyUp={endGesture}
        onBlur={endGesture}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          if (next === value) return;
          onChange(next, !changed.current);
          changed.current = true;
        }}
      />
      <div className="arrow-roughness-scale" aria-hidden="true">
        <span>Smooth</span>
        <span>Sketchy</span>
      </div>
    </div>
  );
}
