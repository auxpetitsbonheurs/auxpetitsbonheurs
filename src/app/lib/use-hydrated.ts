import { useSyncExternalStore } from "react";

const noSubscription = () => () => {};

/** True once React runs in the browser: controls that need JavaScript appear only then. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noSubscription, () => true, () => false);
}
