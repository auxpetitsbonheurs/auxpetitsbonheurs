// Cloudflare Turnstile in the browser (E-08 S-162). Loaded only when the server gave a site key,
// after hydration, so it costs nothing in the route's JS budget. Tokens are single-use: each
// photo upload takes one (`takeToken`), which resets the widget for a fresh one, and the form
// posts the latest. A script that never loads (blocked, offline) or a widget error is "failed":
// the form says so and does not submit silently (AC5). Non-interactive widget: no puzzles (AC7).
import { useCallback, useEffect, useRef, useState } from "react";

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
export const TURNSTILE_LOAD_TIMEOUT_MS = 10_000;
const TOKEN_WAIT_MS = 15_000;

export interface TurnstileApi {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

/** The Cloudflare script, loaded once per page (shared with the checkout's widget, S-091 AC8). */
export function loadScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    const timer = window.setTimeout(() => reject(new Error("turnstile timeout")), TURNSTILE_LOAD_TIMEOUT_MS);
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("turnstile missing"));
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("turnstile blocked"));
    };
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

export type TurnstileState = "off" | "loading" | "ready" | "failed";

export interface TurnstileHandle {
  state: TurnstileState;
  /** The token the form posts now (empty while a fresh one is being made). */
  token: string;
  /** Where the widget renders (it is invisible unless Cloudflare needs an interaction). */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** A token for one upload; the widget then makes the next one. Undefined when Turnstile is off. */
  takeToken: () => Promise<string | undefined>;
}

export function useTurnstile(siteKey: string | null, language: string): TurnstileHandle {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<TurnstileState>(siteKey ? "loading" : "off");
  const [token, setToken] = useState("");
  const tokenRef = useRef("");
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const waiters = useRef<((value: string) => void)[]>([]);

  const receive = useCallback((value: string) => {
    tokenRef.current = value;
    setToken(value);
    if (value) for (const resolve of waiters.current.splice(0)) resolve(value);
  }, []);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;
    loadScript()
      .then((api) => {
        if (cancelled || !containerRef.current) return;
        const id = api.render(containerRef.current, {
          sitekey: siteKey,
          language,
          appearance: "interaction-only",
          callback: (value: string) => {
            setState("ready");
            receive(value);
          },
          "expired-callback": () => api.reset(id),
          "error-callback": () => setState("failed"),
        });
        widget.current = { api, id };
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      });
    return () => {
      cancelled = true;
      if (widget.current) widget.current.api.remove(widget.current.id);
      widget.current = null;
    };
  }, [siteKey, language, receive]);

  const takeToken = useCallback(async () => {
    if (!siteKey) return undefined;
    const value =
      tokenRef.current ||
      (await new Promise<string>((resolve, reject) => {
        waiters.current.push(resolve);
        window.setTimeout(() => reject(new Error("no token")), TOKEN_WAIT_MS);
      }).catch(() => ""));
    receive("");
    if (widget.current) widget.current.api.reset(widget.current.id);
    return value || undefined;
  }, [siteKey, receive]);

  return { state, token, containerRef, takeToken };
}
