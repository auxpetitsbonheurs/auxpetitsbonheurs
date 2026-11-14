// The Today Undo toast's state (S-121): one at a time, set by the row that was just advanced and
// read by `UndoToast`. A tiny external store, like the Toaster's.
import { useSyncExternalStore } from "react";

export interface UndoOffer {
  id: number;
  orderId: string;
  /** The version after the forward step: Undo is refused if anything changed since. */
  version: number;
  number: string;
  /** Status words now and after Undo. */
  statusLabel: string;
  previousLabel: string;
}

let current: UndoOffer | null = null;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function offerUndo(offer: Omit<UndoOffer, "id">): void {
  current = { ...offer, id: nextId++ };
  emit();
}

export function clearUndo(id?: number): void {
  if (id !== undefined && current?.id !== id) return;
  current = null;
  emit();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useUndoOffer(): UndoOffer | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
