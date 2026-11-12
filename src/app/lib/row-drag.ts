// The arithmetic behind dragging a menu row (S-042, phone drag feedback). Pure functions,
// so the hook in components/admin/use-row-drag.ts only measures, renders and listens.
// While a row is dragged nothing moves in the DOM: the rows keep the layout measured at
// pick-up and slide with `transform`, so these work on that one snapshot of slots.

/** A row's place in the page (document coordinates), measured when the drag starts. */
export interface Slot {
  top: number;
  height: number;
}

/**
 * Where the dragged row (`from`) lands for a ghost whose centre is at `centre`: the number
 * of other rows whose middle is above that centre. Rows never swap back and forth because
 * the slots do not move while dragging.
 */
export function dropIndex(slots: readonly Slot[], from: number, centre: number): number {
  let index = 0;
  slots.forEach((slot, i) => {
    if (i !== from && centre > slot.top + slot.height / 2) index += 1;
  });
  return index;
}

/**
 * How far (px, positive is down) row `index` slides while row `from` is shown at `to`.
 * The dragged row itself becomes the drop placeholder and slides to the target slot; the
 * rows it passes slide by its height the other way to make room.
 */
export function rowShift(slots: readonly Slot[], from: number, to: number, index: number): number {
  const dragged = slots[from];
  if (!dragged || from === to) return 0;
  if (index === from) {
    const target = slots[to];
    if (!target) return 0;
    return to > from ? target.top + target.height - (dragged.top + dragged.height) : target.top - dragged.top;
  }
  if (from < to && index > from && index <= to) return -dragged.height;
  if (to < from && index >= to && index < from) return dragged.height;
  return 0;
}

/** Edge band (px) where resting the finger scrolls the page, and the fastest step per frame. */
export const EDGE_PX = 72;
export const MAX_SCROLL_STEP = 16;

/**
 * Page scroll per frame for a finger at `y` (viewport px) between `top` and `bottom` (the
 * viewport, or the top of the fixed bottom bar): faster the deeper into the edge band,
 * nothing outside it.
 */
export function edgeScrollStep(y: number, top: number, bottom: number, edge = EDGE_PX, max = MAX_SCROLL_STEP): number {
  const depth = y < top + edge ? top + edge - y : y > bottom - edge ? -(y - (bottom - edge)) : 0;
  if (depth === 0) return 0;
  const step = Math.ceil((Math.min(Math.abs(depth), edge) / edge) * max);
  return depth > 0 ? -step : step;
}

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * The finger is "outside the list" (release cancels) once it is more than `slop` px beyond
 * any of the list's edges; the slop lets a quick drag to the first or last place overshoot.
 */
export function outsideList(list: Box, x: number, y: number, slop: number): boolean {
  return x < list.left - slop || x > list.right + slop || y < list.top - slop || y > list.bottom + slop;
}
