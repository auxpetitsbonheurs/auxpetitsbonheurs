// Customer pages start their JavaScript after the load event and an idle moment (S-276 AC7;
// Owner decision 2026-11-13). Until then every link, the Add to basket form, the language switch
// and the phone menu (a link to /menu-links) work as plain navigations and form posts; once
// React has hydrated they are instant. Admin pages, forms (basket, contact, custom cake, order
// pages) and anything unknown keep their JavaScript at once.
//
// How: React Router's <Scripts> writes modulepreload links and one module script. On the
// way out, entry.server rewrites the document stream: the links get `rel="x-modulepreload"`, the
// module script becomes inert text (`type="text/plain"`), and a ~600 byte loader before </body>
// restores both when the page has loaded and the browser is idle (the same rule as
// lib/after-load.ts, written for the browser as plain script). Nothing about the route modules
// changes: `window.__reactRouterContext` (an ordinary inline script) is still set at once.
import { LOAD_CAP_MS } from "./after-load";

/** Attribute that marks the module script waiting for the loader. */
export const DEFER_MARKER = "data-apb-deferred";

/** Route ids (app/routes.ts) of the pages that read and browse: safe to hydrate late. */
const DEFERRED_PAGE = /^(home|menu|menu-links|our-story|workshops|gallery|product|reviews|not-found)-(en|fr)$/;
const FRAME_IDS = new Set(["root", "site-en", "site-fr"]);

/** True when every matched route is the root, the customer frame or one of the browsing pages. */
export function shouldDeferHydration(routeIds: readonly string[]): boolean {
  return routeIds.some((id) => DEFERRED_PAGE.test(id)) && routeIds.every((id) => FRAME_IDS.has(id) || DEFERRED_PAGE.test(id));
}

/**
 * Runs in the browser. After the window's load event and the next idle moment (or LOAD_CAP_MS
 * when load never comes) it re-enables the modulepreloads and starts the module script.
 */
export const HYDRATION_LOADER =
  `(function(){var d=false,n=document.currentScript&&document.currentScript.nonce;` +
  `function go(){if(d)return;d=true;` +
  `var l=document.querySelectorAll('link[rel="x-modulepreload"]');for(var i=0;i<l.length;i++)l[i].rel="modulepreload";` +
  `var p=document.querySelector("script[${DEFER_MARKER}]");if(!p)return;` +
  `var s=document.createElement("script");s.type="module";if(n)s.nonce=n;s.textContent=p.textContent;document.body.appendChild(s)}` +
  `function idle(){if(window.requestIdleCallback)requestIdleCallback(go,{timeout:2000});else setTimeout(go,200)}` +
  `setTimeout(go,${LOAD_CAP_MS});` +
  `if(document.readyState==="complete")idle();else addEventListener("load",idle,{once:true})})()`;

const MODULEPRELOAD = /<link\b[^>]*\brel="modulepreload"[^>]*>/g;
const MODULE_SCRIPT = /<script\b[^>]*\btype="module"[^>]*>/g;
const BODY_END = "</body>";

/** Remembers, across chunks, that a module script went by (the loader is only added then). */
interface RewriteState {
  sawModuleScript: boolean;
  /** `<script>` or `<script nonce="…">`: the page's CSP nonce (S-228 AC7), which the loader passes on. */
  loaderOpen: string;
}

/** Only a base64 nonce (workers/security-headers.ts) is written into the page. */
function loaderOpenTag(nonce: string | undefined): string {
  return nonce && /^[A-Za-z0-9+/=]+$/.test(nonce) ? `<script nonce="${nonce}">` : "<script>";
}

/** Rewrites the complete tags in `html`; a tag cut in two is kept back by the stream (`holdBack`). */
function rewrite(html: string, state: RewriteState): string {
  return html
    .replace(MODULEPRELOAD, (tag) => tag.replace('rel="modulepreload"', 'rel="x-modulepreload"'))
    .replace(MODULE_SCRIPT, () => {
      state.sawModuleScript = true;
      return `<script type="text/plain" ${DEFER_MARKER}="">`;
    })
    .replace(BODY_END, (end) => (state.sawModuleScript ? `${state.loaderOpen}${HYDRATION_LOADER}</script>${end}` : end));
}

/** The whole document at once (the reference the stream must match). */
export function deferScripts(html: string, nonce?: string): string {
  return rewrite(html, { sawModuleScript: false, loaderOpen: loaderOpenTag(nonce) });
}

/** Index where an unfinished tag starts (a `<` with no `>` after it), or `text.length`. */
function holdBack(text: string): number {
  const open = text.lastIndexOf("<");
  return open !== -1 && !text.includes(">", open) ? open : text.length;
}

/**
 * A TransformStream that applies the rewrite to a streamed HTML document. It sends everything up
 * to the last finished tag and keeps the rest for the next chunk, so a tag cut between two chunks
 * is still recognised.
 */
export function createDeferScriptsTransform(nonce?: string): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const state: RewriteState = { sawModuleScript: false, loaderOpen: loaderOpenTag(nonce) };
  let pending = "";
  const emit = (controller: TransformStreamDefaultController<Uint8Array>, text: string) => {
    if (text !== "") controller.enqueue(encoder.encode(rewrite(text, state)));
  };
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const text = pending + decoder.decode(chunk, { stream: true });
      const cut = holdBack(text);
      pending = text.slice(cut);
      emit(controller, text.slice(0, cut));
    },
    flush(controller) {
      emit(controller, pending + decoder.decode());
    },
  });
}
