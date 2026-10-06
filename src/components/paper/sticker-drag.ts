import type { StickerDrop } from "../../data/stickers";

// The palette uses the same pointer model as existing canvas objects. Nothing
// enters document history until a valid drop has finished.
export function trackStickerDrag(
  host: Window,
  start: PointerEvent,
  callbacks: {
    target: (x: number, y: number) => StickerDrop | null;
    preview: (
      point: { x: number; y: number; target: StickerDrop | null } | null,
    ) => void;
    finish: (target: StickerDrop | null, suppressClick: boolean) => void;
  },
) {
  let active = false,
    finished = false;
  const cleanup = () => {
    host.removeEventListener("pointermove", move);
    host.removeEventListener("pointerup", up);
    host.removeEventListener("pointercancel", cancel);
    host.removeEventListener("keydown", key);
    host.removeEventListener("blur", cancel);
    callbacks.preview(null);
  };
  const finish = (drop: StickerDrop | null, suppress = active) => {
    if (finished) return;
    finished = true;
    cleanup();
    callbacks.finish(drop, suppress);
  };
  const move = (event: PointerEvent) => {
    if (event.pointerId !== start.pointerId) return;
    if (
      !active &&
      Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) <
        5
    )
      return;
    active = true;
    event.preventDefault();
    callbacks.preview({
      x: event.clientX,
      y: event.clientY,
      target: callbacks.target(event.clientX, event.clientY),
    });
  };
  const up = (event: PointerEvent) => {
    if (event.pointerId === start.pointerId)
      finish(active ? callbacks.target(event.clientX, event.clientY) : null);
  };
  const cancel = (event: Event) => {
    if (
      event.type !== "pointercancel" ||
      (event as PointerEvent).pointerId === start.pointerId
    )
      finish(null, true);
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      finish(null, true);
    }
  };
  host.addEventListener("pointermove", move, { passive: false });
  host.addEventListener("pointerup", up);
  host.addEventListener("pointercancel", cancel);
  host.addEventListener("keydown", key);
  host.addEventListener("blur", cancel);
  return () => finish(null, true);
}
