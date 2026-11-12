// Drag arithmetic for menu rows (S-042 phone drag feedback): drop target, row slides,
// edge auto-scroll and "released outside the list".
import { describe, expect, test } from "vitest";
import { moveItem } from "./use-drag-sort";
import { type Slot, dropIndex, edgeScrollStep, outsideList, rowShift } from "./row-drag";

/** Four rows of 80 px from y = 100, the third one taller (it wraps). */
const slots: Slot[] = [
  { top: 100, height: 80 },
  { top: 180, height: 80 },
  { top: 260, height: 120 },
  { top: 380, height: 80 },
];

describe("dropIndex", () => {
  test("stays in place until the ghost's centre passes a neighbour's middle", () => {
    expect(dropIndex(slots, 1, 220)).toBe(1); // its own centre
    expect(dropIndex(slots, 1, 319)).toBe(1); // just above the tall row's middle (320)
    expect(dropIndex(slots, 1, 321)).toBe(2);
    expect(dropIndex(slots, 1, 141)).toBe(1); // first row's middle is 140: still second
    expect(dropIndex(slots, 1, 139)).toBe(0);
  });

  test("reaches the first and the last place, and beyond them stays there", () => {
    expect(dropIndex(slots, 2, 130)).toBe(0);
    expect(dropIndex(slots, 2, -500)).toBe(0);
    expect(dropIndex(slots, 0, 430)).toBe(3);
    expect(dropIndex(slots, 0, 5000)).toBe(3);
  });

  test("a single row never moves", () => {
    expect(dropIndex([{ top: 0, height: 80 }], 0, 9999)).toBe(0);
  });
});

describe("rowShift", () => {
  const shifts = (from: number, to: number) => slots.map((_, i) => rowShift(slots, from, to, i));

  test("no move, no shift", () => {
    expect(shifts(1, 1)).toEqual([0, 0, 0, 0]);
  });

  test("dragging down: the placeholder takes the target slot, the rows passed move up by its height", () => {
    // Row 0 (80 px) to place 2: rows 1 and 2 move up 80; the placeholder ends where row 2 ended.
    expect(shifts(0, 2)).toEqual([380 - 180, -80, -80, 0]);
  });

  test("dragging up: the placeholder takes the target's top, the rows passed move down by its height", () => {
    // The tall row 2 (120 px) to the top: rows 0 and 1 move down 120.
    expect(shifts(2, 0)).toEqual([120, 120, -160, 0]);
  });

  test("the shifted layout is the reordered list, slot for slot", () => {
    for (const [from, to] of [[0, 3], [3, 0], [1, 2], [2, 1]] as const) {
      const shiftedTops = slots.map((slot, i) => slot.top + rowShift(slots, from, to, i));
      const reordered = moveItem(slots.map((_, i) => i), from, to);
      // Each row's new top is the sum of the heights before it in the new order.
      let top = 100;
      for (const index of reordered) {
        expect(shiftedTops[index]).toBe(top);
        top += slots[index]!.height;
      }
    }
  });
});

describe("edgeScrollStep", () => {
  test("nothing away from the edges", () => {
    expect(edgeScrollStep(300, 0, 667)).toBe(0);
    expect(edgeScrollStep(72, 0, 667)).toBe(0);
    expect(edgeScrollStep(667 - 72, 0, 667)).toBe(0);
  });

  test("scrolls up near the top and down near the bottom, faster the deeper", () => {
    expect(edgeScrollStep(60, 0, 667)).toBeLessThan(0);
    expect(edgeScrollStep(0, 0, 667)).toBe(-16);
    expect(Math.abs(edgeScrollStep(10, 0, 667))).toBeGreaterThan(Math.abs(edgeScrollStep(60, 0, 667)));
    expect(edgeScrollStep(667 - 10, 0, 667)).toBeGreaterThan(0);
  });

  test("the bottom edge is the fixed bottom bar's top, and past it is full speed", () => {
    // Bar from 600: a finger at 560 is inside the band above it.
    expect(edgeScrollStep(560, 0, 600)).toBeGreaterThan(0);
    expect(edgeScrollStep(640, 0, 600)).toBe(16);
  });
});

describe("outsideList", () => {
  const list = { left: 16, right: 359, top: 200, bottom: 600 };

  test("inside, or within the slop, is not outside", () => {
    expect(outsideList(list, 100, 400, 80)).toBe(false);
    expect(outsideList(list, 100, 150, 80)).toBe(false);
    expect(outsideList(list, 100, 670, 80)).toBe(false);
  });

  test("beyond the slop on any side is outside", () => {
    expect(outsideList(list, 100, 100, 80)).toBe(true);
    expect(outsideList(list, 100, 700, 80)).toBe(true);
    expect(outsideList(list, -70, 400, 80)).toBe(true);
    expect(outsideList(list, 450, 400, 80)).toBe(true);
  });
});
