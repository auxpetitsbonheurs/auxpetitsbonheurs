// The admin app's service worker (S-035, contracts.md "static" row and push payload), served
// by `routes/admin/sw.ts` at /admin/sw.js. It is plain JavaScript kept here as one string:
// the browser runs exactly these bytes (no bundler between this file and the phone), and
// sw-handlers.test.ts runs the same string against a fake service-worker global.
//
// What it does: `push` shows a notification from the payload `{ title, body, url, tag }`;
// `notificationclick` focuses an open admin tab (or opens one) at `data.url`. Only paths
// under /admin are followed, anything else opens /admin. No fetch handler and no cache: the
// admin app is always online-only and never stores admin data on the device (FR-047, NFR-004).
// Keep changes backward-compatible for one release (contracts.md "Versioning").

/** Bump when the script changes, so installed workers pick up the new one (no-cache also helps). */
export const SERVICE_WORKER_VERSION = "1";

export const SERVICE_WORKER_SOURCE = `/* Aux petits bonheurs admin service worker v${SERVICE_WORKER_VERSION} */
"use strict";
var FALLBACK_TITLE = "Aux petits bonheurs";
var HOME = "/admin";
function adminPath(url) {
  if (typeof url !== "string" || url.indexOf("\\\\") !== -1) return HOME;
  return /^\\/admin(?:[/?#]|$)/.test(url) ? url : HOME;
}
function notificationFrom(payload) {
  var p = payload && typeof payload === "object" ? payload : {};
  var options = { body: typeof p.body === "string" ? p.body : "", data: { url: adminPath(p.url) }, icon: "/admin/icon-192.png", badge: "/admin/icon-192.png" };
  if (typeof p.tag === "string" && p.tag) options.tag = p.tag;
  return { title: typeof p.title === "string" && p.title ? p.title : FALLBACK_TITLE, options: options };
}
function readPayload(event) {
  try { return event.data ? event.data.json() : {}; } catch (error) { return {}; }
}
async function openAdmin(url) {
  var windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (var i = 0; i < windows.length; i += 1) {
    var client = windows[i];
    if (new URL(client.url).pathname.indexOf(HOME) === 0) {
      var focused = await client.focus();
      return focused && focused.navigate ? focused.navigate(url) : focused;
    }
  }
  return self.clients.openWindow(url);
}
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) { event.waitUntil(self.clients.claim()); });
self.addEventListener("push", function (event) {
  var shown = notificationFrom(readPayload(event));
  event.waitUntil(self.registration.showNotification(shown.title, shown.options));
});
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var data = event.notification.data || {};
  event.waitUntil(openAdmin(adminPath(data.url)));
});
`;
