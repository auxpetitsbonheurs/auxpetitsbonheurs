// Phone-first pointer dragging for the menu rows (S-042, Owner's phone report 2026-11-12).
// Press the grip: a short buzz where supported, the row lifts into a floating "ghost" that
// follows the finger, and the row's own slot becomes a dashed drop placeholder that slides
// to where it will land while the other rows slide to make room (transform only, 150 ms;
// none with reduced motion). Resting near the top edge or the bottom bar scrolls the page.
// Release settles the ghost into the placeholder, then the caller saves; Esc, a cancelled
// pointer or a release well outside the list puts it back. Pointer capture on the handle
// and `touch-action: none` keep the page from scrolling or selecting text meanwhile.
// Only the menu list uses this (the product editor keeps lib/use-drag-sort.ts, so its JS
// budget does not move). Keyboard users keep the arrow keys and Move up / Move down.
import { type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useRef, useState } from "react";
import { type Slot, dropIndex, edgeScrollStep, outsideList, rowShift } from "~/lib/row-drag";

export interface RowDragCallbacks {
  onPick: (index: number) => void;
  /** The drop target changed (`to` is where the row would land). */
  onTarget: (to: number, from: number) => void;
  /** Released on a new place, after the ghost has settled there. */
  onDrop: (from: number, to: number) => void;
  /** Put back (Esc, released outside the list or on its own place, pointer cancelled). */
  onCancel: (from: number) => void;
}

export interface RowDragState {
  from: number;
  to: number;
  /** The rows as measured at pick-up; they keep that layout and only slide. */
  slots: readonly Slot[];
}

/** Lift and settle time; matches the rows' `duration-150`. */
const SETTLE_MS = 150;
const LIFT = "scale(1.02)";

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** Short buzz on pick-up where the phone allows it (Android Chrome; iOS ignores it). */
function buzz() {
  try {
    navigator.vibrate?.(10);
  } catch {
    // Not allowed here: the visual lift is the feedback.
  }
}

/** A visual copy of the row, fixed over it, that follows the finger. Hidden from assistive tech. */
function makeGhost(row: HTMLElement, rect: DOMRect): HTMLElement {
  const ghost = row.cloneNode(true) as HTMLElement;
  for (const el of [ghost, ...ghost.querySelectorAll<HTMLElement>("[id]")]) el.removeAttribute("id");
  ghost.removeAttribute("data-sort-item");
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("inert", "");
  ghost.dataset.dragGhost = "";
  ghost.className = `${ghost.className} pointer-events-none z-50 m-0 list-none rounded-card border border-primary bg-card shadow-lg`;
  // The grip being held stands out in the lifted copy.
  const grip = ghost.querySelector<HTMLElement>("[data-reorder-handle]");
  grip?.removeAttribute("data-reorder-handle");
  if (grip) grip.className = `${grip.className} bg-accent ring-2 ring-primary`;
  Object.assign(ghost.style, {
    // Inline: the row's own `relative` class would win over a `fixed` class.
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    transform: "scale(1)",
    transition: reducedMotion() ? "none" : `transform ${SETTLE_MS}ms ease-out, top ${SETTLE_MS}ms ease-out`,
  });
  document.body.appendChild(ghost);
  // Lift on the next frame so the scale animates from the row's own size.
  requestAnimationFrame(() => (ghost.style.transform = LIFT));
  return ghost;
}

/** The page's usable bottom edge: the fixed admin bottom bar's top on phones, else the viewport. */
function bottomEdge(): number {
  const bar = document.querySelector<HTMLElement>("[data-bottom-bar]");
  if (bar && getComputedStyle(bar).position === "fixed") return bar.getBoundingClientRect().top;
  return window.innerHeight;
}

interface Session {
  pointerId: number;
  from: number;
  to: number;
  x: number;
  y: number;
  /** Finger to ghost top, so the ghost does not jump under the finger. */
  grab: number;
  slots: Slot[];
  ghost: HTMLElement;
  bottom: number;
  frame: number;
  stop: () => void;
}

export function useRowDrag(list: RefObject<HTMLElement | null>, callbacks: RowDragCallbacks) {
  const [state, setState] = useState<RowDragState | null>(null);
  const latest = useRef(callbacks);
  useEffect(() => {
    latest.current = callbacks;
  });
  const session = useRef<Session | null>(null);
  // Leaving the page mid-drag: no ghost left behind.
  useEffect(
    () => () => {
      session.current?.stop();
      session.current?.ghost.remove();
    },
    [],
  );

  const target = (s: Session) => {
    const box = list.current?.getBoundingClientRect();
    const slot = s.slots[s.from]!;
    if (!box || outsideList(box, s.x, s.y, slot.height)) return s.from;
    return dropIndex(s.slots, s.from, s.y - s.grab + slot.height / 2 + window.scrollY);
  };

  const retarget = (s: Session) => {
    const to = target(s);
    if (to === s.to) return;
    s.to = to;
    setState({ from: s.from, to, slots: s.slots });
    latest.current.onTarget(to, s.from);
  };

  /** Settle the ghost on the placeholder (or back home), then hand over. */
  const finish = (s: Session, cancelled: boolean) => {
    s.stop();
    const to = cancelled ? s.from : s.to;
    if (to !== s.to) setState({ from: s.from, to, slots: s.slots });
    const home = s.slots[s.from]!;
    s.ghost.style.top = `${home.top + rowShift(s.slots, s.from, to, s.from) - window.scrollY}px`;
    s.ghost.style.transform = "scale(1)";
    window.setTimeout(
      () => {
        s.ghost.remove();
        // Only now may another drag start: the settling ghost is gone.
        session.current = null;
        setState(null);
        if (to === s.from) latest.current.onCancel(s.from);
        else latest.current.onDrop(s.from, to);
      },
      reducedMotion() ? 0 : SETTLE_MS,
    );
  };

  const start = (index: number, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || session.current || !list.current) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const rows = [...list.current.querySelectorAll<HTMLElement>(":scope > [data-sort-item]")];
    const row = rows[index];
    if (!row) return;
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // Capture refused (pointer already gone): the window listeners below still work.
    }
    buzz();
    const rect = row.getBoundingClientRect();
    const slots = rows.map((r) => {
      const b = r.getBoundingClientRect();
      return { top: b.top + window.scrollY, height: b.height };
    });
    const html = document.documentElement;
    const previousSelect = html.style.userSelect;
    html.style.userSelect = "none";
    html.style.setProperty("-webkit-user-select", "none");

    const s: Session = {
      pointerId: event.pointerId,
      from: index,
      to: index,
      x: event.clientX,
      y: event.clientY,
      grab: event.clientY - rect.top,
      slots,
      ghost: makeGhost(row, rect),
      bottom: bottomEdge(),
      frame: 0,
      stop: () => undefined,
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== s.pointerId) return;
      e.preventDefault();
      s.x = e.clientX;
      s.y = e.clientY;
      s.ghost.style.top = `${s.y - s.grab}px`;
      retarget(s);
    };
    // Rest near the top edge or just above the bottom bar: the page scrolls, the target follows.
    const scroll = () => {
      const step = edgeScrollStep(s.y, 0, s.bottom);
      if (step !== 0) {
        window.scrollBy({ top: step, behavior: "instant" });
        retarget(s);
      }
      s.frame = requestAnimationFrame(scroll);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== s.pointerId) return;
      const box = list.current?.getBoundingClientRect();
      finish(s, !box || outsideList(box, e.clientX, e.clientY, s.slots[s.from]!.height));
    };
    const cancel = (e: PointerEvent) => {
      if (e.pointerId === s.pointerId) finish(s, true);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      finish(s, true);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, true);
    s.frame = requestAnimationFrame(scroll);
    s.stop = () => {
      cancelAnimationFrame(s.frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key, true);
      html.style.userSelect = previousSelect;
      html.style.removeProperty("-webkit-user-select");
      try {
        if (handle.hasPointerCapture(s.pointerId)) handle.releasePointerCapture(s.pointerId);
      } catch {
        // Already released.
      }
      s.stop = () => undefined;
    };
    session.current = s;
    setState({ from: index, to: index, slots });
    latest.current.onPick(index);
  };

  /** Spread on the grip of row `index`. */
  const handleProps = (index: number) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => start(index, event),
    // A long press must not open the browser's menu or text callout on the grip.
    onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
    style: { touchAction: "none" as const, WebkitTouchCallout: "none" as const, userSelect: "none" as const },
  });

  /** Inline style for row `index`: its slide while a drag is on (none otherwise). */
  const rowStyle = (index: number) => {
    if (!state) return undefined;
    const shift = rowShift(state.slots, state.from, state.to, index);
    return shift === 0 ? undefined : { transform: `translateY(${shift}px)` };
  };

  return { state, handleProps, rowStyle };
}
