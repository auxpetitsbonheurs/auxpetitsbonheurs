// Pointer dragging for short lists (S-042 menu rows, S-047 photos, S-048 groups and choices).
// Works with a finger, a pen or a mouse: press a handle, move over another item, release.
// Items are the container's children marked `data-sort-item` in a column; the dragged item
// takes the place of the one the pointer passes the middle of. Keyboard users have the arrow keys on
// the handle (where offered) and the Move buttons; this hook only adds the pointer path.
import { type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useRef, useState } from "react";

export interface DragSortOptions {
  container: RefObject<HTMLElement | null>;
  /** Live move while dragging (the list re-renders in its new order). */
  onMove: (from: number, to: number) => void;
  /** Once released, with where the item started and where it ended. */
  onDrop?: (from: number, to: number) => void;
}

/**
 * Where the dragged item (now at `current`) should go for a pointer at `y`: the item under the
 * pointer, once the pointer is past that item's middle in the direction of travel. The middle
 * rule keeps tall items (group cards) from swapping back and forth.
 */
function targetAt(container: HTMLElement, y: number, current: number): number {
  const items = [...container.querySelectorAll<HTMLElement>(":scope > [data-sort-item]")];
  let target = current;
  items.forEach((item, index) => {
    const r = item.getBoundingClientRect();
    const middle = r.top + r.height / 2;
    if (index > current && y > middle) target = Math.max(target, index);
    if (index < current && y < middle && (target === current || index < target)) target = index;
  });
  return target;
}

/** Pixels per frame the page scrolls while the pointer rests near the top or bottom edge. */
const EDGE = 56;
const SPEED = 12;

export function useDragSort({ container, onMove, onDrop }: DragSortOptions) {
  const [dragging, setDragging] = useState<number | null>(null);
  const callbacks = useRef({ onMove, onDrop });
  useEffect(() => {
    callbacks.current = { onMove, onDrop };
  });
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  /** Spread on the drag handle of item `index`. */
  const handleProps = (index: number) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || stop.current) return;
      event.preventDefault();
      // Window listeners, not pointer capture: the handle moves in the DOM as the list re-orders.
      const drag = { start: index, current: index, pointerId: event.pointerId, y: event.clientY, frame: 0 };
      setDragging(index);
      const place = () => {
        if (!container.current) return;
        const target = targetAt(container.current, drag.y, drag.current);
        if (target === drag.current) return;
        callbacks.current.onMove(drag.current, target);
        drag.current = target;
        setDragging(target);
      };
      // Long lists on a phone: rest near an edge and the page scrolls, the item following.
      const scroll = () => {
        const step = drag.y < EDGE ? -SPEED : drag.y > window.innerHeight - EDGE ? SPEED : 0;
        if (step !== 0) {
          window.scrollBy({ top: step, behavior: "instant" });
          place();
        }
        drag.frame = requestAnimationFrame(scroll);
      };
      drag.frame = requestAnimationFrame(scroll);
      const move = (e: PointerEvent) => {
        if (e.pointerId !== drag.pointerId) return;
        drag.y = e.clientY;
        place();
      };
      const end = (e: PointerEvent) => {
        if (e.pointerId !== drag.pointerId) return;
        stop.current?.();
        setDragging(null);
        if (drag.start !== drag.current) callbacks.current.onDrop?.(drag.start, drag.current);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
      stop.current = () => {
        cancelAnimationFrame(drag.frame);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        stop.current = null;
      };
    },
    // No page scroll or text selection while dragging by the handle.
    style: { touchAction: "none" as const },
  });

  return { dragging, handleProps };
}

/** `list` with the item at `from` moved to `to`. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}
