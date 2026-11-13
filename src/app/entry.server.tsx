// React Router's default Cloudflare server entry, plus `handleError`: a failed loader or action
// is logged as one structured line with its cause chain (~/server/error-log.server).
import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import type { EntryContext, HandleErrorFunction, RouterContextProvider } from "react-router";
import { ServerRouter } from "react-router";
import { createDeferScriptsTransform, shouldDeferHydration } from "~/lib/defer-hydration";
import { serverErrorLogLine } from "~/server/error-log.server";

export const handleError: HandleErrorFunction = (error, { request }) => {
  // A visitor who went away is not a server error.
  if (request.signal.aborted) return;
  console.error(JSON.stringify(serverErrorLogLine(error, request.method, new URL(request.url).pathname)));
};

export const streamTimeout = 5_000;

/**
 * A Suspense boundary that is already finished stays inline in the HTML. React's default
 * (12.8 kB) moves a finished boundary after that much page into a hidden element that a
 * script reveals, which a browser without JavaScript never runs (the product page's ordering
 * area must work as a plain form, S-066 AC5). Nothing here streams data late, so nothing is lost.
 */
export const DOCUMENT_STREAM_OPTIONS = { progressiveChunkSize: Number.POSITIVE_INFINITY } as const;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: RouterContextProvider,
) {
  // https://httpwg.org/specs/rfc9110.html#HEAD
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  let shellRendered = false;
  const userAgent = request.headers.get("user-agent");

  const body = await renderToReadableStream(
    <ServerRouter context={routerContext} url={request.url} />,
    {
      ...DOCUMENT_STREAM_OPTIONS,
      signal: AbortSignal.timeout(streamTimeout + 1000),
      onError(error: unknown) {
        responseStatusCode = 500;
        // Log streaming rendering errors from inside the shell. Don't log
        // errors encountered during initial shell rendering since they'll
        // reject and get logged in handleDocumentRequest.
        if (shellRendered) {
          console.error(error);
        }
      },
    },
  );
  shellRendered = true;

  // Ensure requests from bots and SPA Mode renders wait for all content to load before responding
  // https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
  if ((userAgent && isbot(userAgent)) || routerContext.isSpaMode) {
    await body.allReady;
  }

  responseHeaders.set("Content-Type", "text/html");
  // Browsing pages start their JavaScript after load + idle, so it never shares bandwidth with the
  // LCP photo (S-276 AC7); links and forms work as plain navigations until then.
  const routeIds = routerContext.staticHandlerContext.matches.map((match) => match.route.id);
  const page = shouldDeferHydration(routeIds) ? body.pipeThrough(createDeferScriptsTransform()) : body;
  return new Response(page, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
