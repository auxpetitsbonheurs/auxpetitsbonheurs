// The page loader for full page loads (S-317 AC5). Browsing pages start React only after load
// and an idle moment (lib/defer-hydration.ts), so an early tap is a plain navigation that React
// never sees. This small script, written before </body> on every customer page with the
// response's CSP nonce, shows the same overlay (components/shell/page-loader.tsx) when a
// same-origin link or form leaves the page, and hides it again when the browser restores the
// page from its back/forward cache. Once React handles a link (it calls preventDefault) the
// script stays out of the way: React shows the overlay itself.
//
// It also gives the overlay's badge its srcset after load and an idle moment, so the badge
// never shares bandwidth with the page's LCP image and is ready by the first page change.

/** id of the overlay root; `data-*` hooks shared by the script, React and the CSS. */
export const PAGE_LOADER_ID = "apb-page-loader";

/** A full page load that never unloads (a download, a stopped load) hides the overlay after this. */
export const FULL_LOAD_SAFETY_MS = 10_000;

/** Same DOM steps as lib/page-loader-dom.ts, written as plain browser script (no build step). */
export const PAGE_LOADER_SCRIPT =
  `(function(){var d=document,r=d.getElementById("${PAGE_LOADER_ID}");if(!r)return;` +
  `var v=r.querySelector("[data-page-loader-veil]"),t=r.querySelector("[data-page-loader-text]"),k;` +
  `function img(){var i=r.querySelector("img[data-srcset]");if(i&&!i.srcset){i.sizes=i.getAttribute("data-sizes");i.srcset=i.getAttribute("data-srcset")}}` +
  `function show(){img();r.setAttribute("role","status");v.setAttribute("data-show","");t.textContent=r.getAttribute("data-label");clearTimeout(k);k=setTimeout(hide,${FULL_LOAD_SAFETY_MS})}` +
  `function hide(){clearTimeout(k);v.removeAttribute("data-show");t.textContent="";r.removeAttribute("role")}` +
  `function leaves(h){var u;try{u=new URL(h,location.href)}catch(e){return false}` +
  `return u.origin===location.origin&&!(u.pathname===location.pathname&&u.search===location.search&&u.hash)}` +
  `function later(e){setTimeout(function(){if(!e.defaultPrevented)show()},0)}` +
  `d.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");` +
  `if(!a||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||(a.target&&a.target!=="_self")||a.hasAttribute("download")||!leaves(a.href))return;later(e)});` +
  `d.addEventListener("submit",function(e){var f=e.target;if((f.target&&f.target!=="_self")||!leaves(f.action))return;later(e)});` +
  `addEventListener("pageshow",function(e){if(e.persisted)hide()});` +
  `function idle(){if(window.requestIdleCallback)requestIdleCallback(img,{timeout:2000});else setTimeout(img,200)}` +
  `if(d.readyState==="complete")idle();else addEventListener("load",idle,{once:true})})()`;

const CUSTOMER_FRAME = new Set(["site-en", "site-fr"]);

/** True for pages inside the customer layout (routes/site/layout.tsx), which renders the overlay. */
export function isCustomerPage(routeIds: readonly string[]): boolean {
  return routeIds.some((id) => CUSTOMER_FRAME.has(id));
}

/** `<script>` with the page's nonce; only a base64 nonce (workers/security-headers.ts) is written. */
function scriptTag(nonce: string | undefined): string {
  const open = nonce && /^[A-Za-z0-9+/=]+$/.test(nonce) ? `<script nonce="${nonce}">` : "<script>";
  return `${open}${PAGE_LOADER_SCRIPT}</script>`;
}

const BODY_END = "</body>";

/**
 * A TransformStream that writes the loader script just before </body>. Text that could be the
 * start of a cut "</body>" is held back until the next chunk.
 */
export function createPageLoaderScriptTransform(nonce?: string): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const tag = scriptTag(nonce);
  let pending = "";
  let done = false;
  const write = (controller: TransformStreamDefaultController<Uint8Array>, text: string) => {
    if (text !== "") controller.enqueue(encoder.encode(text));
  };
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const text = pending + decoder.decode(chunk, { stream: true });
      pending = "";
      const at = done ? -1 : text.indexOf(BODY_END);
      if (done) write(controller, text);
      else if (at !== -1) {
        done = true;
        write(controller, text.slice(0, at) + tag + text.slice(at));
      } else {
        const keep = Math.max(0, text.length - (BODY_END.length - 1));
        pending = text.slice(keep);
        write(controller, text.slice(0, keep));
      }
    },
    flush(controller) {
      write(controller, pending + decoder.decode());
    },
  });
}
