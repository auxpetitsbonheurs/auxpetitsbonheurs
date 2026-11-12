// Which install offer the admin app shows (S-035 AC3-AC5), as pure decisions on what the
// browser reports, so the rules are unit-tested without a phone.
//   prompt  - the browser offered installation (`beforeinstallprompt`, Android Chrome):
//             an in-app "Install" button opens the native prompt
//   iosHint - iOS Safari, not installed: one line "Share, then Add to Home Screen"
//   null    - installed already (standalone), dismissed before, or nothing to offer

export type InstallOffer = "prompt" | "iosHint" | null;

/** localStorage key: "Not now" / "Hide this tip" are remembered in this browser. */
export const INSTALL_DISMISSED_KEY = "apb-admin-install-dismissed";

/**
 * iOS or iPadOS Safari itself: only there does "Add to Home Screen" from Share install a
 * web app with push. Chrome, Firefox, Edge and Opera on iOS say so in the user agent; iPadOS
 * reports a Mac user agent with touch points.
 */
export function isIosSafari(userAgent: string, maxTouchPoints = 0): boolean {
  const appleMobile = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|YaBrowser|DuckDuckGo|FBAN|FBAV|Instagram|Line\//.test(userAgent);
  return appleMobile && /AppleWebKit/.test(userAgent) && /Safari\//.test(userAgent) && !otherBrowser;
}

export interface InstallState {
  userAgent: string;
  maxTouchPoints?: number;
  /** `display-mode: standalone` matches, or iOS `navigator.standalone`. */
  standalone: boolean;
  dismissed: boolean;
  /** A deferred `beforeinstallprompt` is waiting. */
  promptAvailable: boolean;
}

export function installOffer(state: InstallState): InstallOffer {
  if (state.standalone || state.dismissed) return null;
  if (state.promptAvailable) return "prompt";
  return isIosSafari(state.userAgent, state.maxTouchPoints) ? "iosHint" : null;
}
