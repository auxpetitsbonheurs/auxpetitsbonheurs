// Request-scoped clock (S-005 AC6). Loaders read "now" from here, never `new Date()`,
// so e2e specs can fix the date per browser context with the `apb_test_now` cookie.
// The cookie is honoured only when TEST_CLOCK=on, which env.server.ts allows in
// development alone.
import { createContext } from "react-router";
import { readCookie } from "~/lib/cookies";

export interface Clock {
  now(): Date;
  /** True when a test fixed "now" (test mode only): per-isolate caches of time-bound data are bypassed. */
  fixed?: boolean;
}

export const TEST_CLOCK_COOKIE = "apb_test_now";

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;

function decoded(raw: string | undefined): string | undefined {
  try {
    return raw === undefined ? undefined : decodeURIComponent(raw);
  } catch {
    return undefined; // malformed escapes: ignore the cookie
  }
}

function testInstant(request: Request): number | undefined {
  const value = decoded(readCookie(request, TEST_CLOCK_COOKIE));
  if (!value || !ISO_INSTANT.test(value)) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

export function createClock(
  options: { testClock: boolean },
  request: Request,
  realNow: () => Date = () => new Date(),
): Clock {
  const fixed = options.testClock ? testInstant(request) : undefined;
  return { now: () => (fixed === undefined ? realNow() : new Date(fixed)), fixed: fixed !== undefined };
}

export const clockContext = createContext<Clock>({ now: () => new Date() });
