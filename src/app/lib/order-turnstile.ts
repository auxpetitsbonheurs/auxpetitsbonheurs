// Turnstile on Place order (S-091 AC8), loaded on demand by the checkout form after the page has
// loaded and the browser is idle, so it costs the basket route nothing up front. The widget is
// managed and invisible ("interaction-only": Cloudflare shows a checkbox only when it must) and
// writes its token into the form's hidden `turnstileToken` input, so the post stays a plain form
// post. Nothing here can block the customer: until a token exists (or if the script never loads)
// the form posts without one and the server relies on the stricter rate limit.
import { loadScript } from "~/lib/use-turnstile";

export interface OrderTurnstile {
  /** A token is single-use: after each submit, clear it and let the widget make a fresh one. */
  reset(): void;
  remove(): void;
}

export async function mountOrderTurnstile(container: HTMLElement, input: HTMLInputElement, siteKey: string, language: string): Promise<OrderTurnstile> {
  const api = await loadScript();
  const id = api.render(container, {
    sitekey: siteKey,
    language,
    appearance: "interaction-only",
    action: "place-order",
    callback: (token: string) => {
      input.value = token;
    },
    "expired-callback": () => {
      input.value = "";
      api.reset(id);
    },
    "error-callback": () => {
      // Posting without a token is allowed (stricter limit), so an error needs no message.
      input.value = "";
    },
  });
  return {
    reset() {
      input.value = "";
      api.reset(id);
    },
    remove() {
      api.remove(id);
    },
  };
}
