export function trackObjectGesture(
  host: Window,
  start: PointerEvent,
  callbacks: {
    move: (event: PointerEvent) => void;
    finish: (cancelled: boolean, moved: boolean) => void;
  },
) {
  let moved = false,
    finished = false;
  const cleanup = () => {
    host.removeEventListener("pointermove", move);
    host.removeEventListener("pointerup", up);
    host.removeEventListener("pointercancel", cancel);
    host.removeEventListener("keydown", key);
    host.removeEventListener("blur", cancel);
  };
  const finish = (cancelled: boolean) => {
    if (finished) return;
    finished = true;
    cleanup();
    callbacks.finish(cancelled, moved);
  };
  const move = (event: PointerEvent) => {
    if (event.pointerId !== start.pointerId) return;
    if (
      !moved &&
      Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) <
        3
    )
      return;
    moved = true;
    event.preventDefault();
    callbacks.move(event);
  };
  const up = (event: PointerEvent) => {
    if (event.pointerId !== start.pointerId) return;
    move(event);
    finish(false);
  };
  const cancel = (event: Event) => {
    if (
      event.type !== "pointercancel" ||
      (event as PointerEvent).pointerId === start.pointerId
    )
      finish(true);
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      finish(true);
    }
  };
  host.addEventListener("pointermove", move, { passive: false });
  host.addEventListener("pointerup", up);
  host.addEventListener("pointercancel", cancel);
  host.addEventListener("keydown", key);
  host.addEventListener("blur", cancel);
  return () => finish(true);
}
