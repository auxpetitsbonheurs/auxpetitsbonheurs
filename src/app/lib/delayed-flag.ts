// The page-change loader's timing (S-284 AC1, AC2): show only when a navigation is still loading
// after LOADER_DELAY_MS, so fast pages never flash; once shown, stay LOADER_MIN_VISIBLE_MS so it
// never blinks. Plain timers (no frame loop), tested with fake timers.

export const LOADER_DELAY_MS = 300;
export const LOADER_MIN_VISIBLE_MS = 300;

export interface DelayedFlagOptions {
  delayMs: number;
  minVisibleMs: number;
  onChange: (visible: boolean) => void;
}

export interface DelayedFlag {
  /** The thing being waited for started (true) or ended (false). */
  set: (active: boolean) => void;
  visible: () => boolean;
  dispose: () => void;
}

export function createDelayedFlag({ delayMs, minVisibleMs, onChange }: DelayedFlagOptions): DelayedFlag {
  let shown = false;
  let shownAt = 0;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const clear = () => {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    showTimer = hideTimer = undefined;
  };
  const show = () => {
    showTimer = undefined;
    shown = true;
    shownAt = Date.now();
    onChange(true);
  };
  const hide = () => {
    hideTimer = undefined;
    shown = false;
    onChange(false);
  };

  function start() {
    clearTimeout(hideTimer);
    hideTimer = undefined;
    if (!shown && showTimer === undefined) showTimer = setTimeout(show, delayMs);
  }

  function stop() {
    clearTimeout(showTimer);
    showTimer = undefined;
    if (!shown || hideTimer !== undefined) return;
    const left = minVisibleMs - (Date.now() - shownAt);
    if (left <= 0) hide();
    else hideTimer = setTimeout(hide, left);
  }

  return {
    set: (active) => (active ? start() : stop()),
    visible: () => shown,
    dispose: clear,
  };
}

/** The parts of `useNavigation()` that tell a page change from a form submission. */
export interface NavigationLike {
  state: "idle" | "loading" | "submitting";
  formMethod?: string | undefined;
}

/** A link or back/forward page change loading (AC7); a form submission keeps its own feedback. */
export function isPageChange(navigation: NavigationLike): boolean {
  return navigation.state === "loading" && navigation.formMethod === undefined;
}
