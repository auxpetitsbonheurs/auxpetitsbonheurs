// One structured log line per request (S-019 AC5, NFR-004). Only the method, the path with
// bearer tokens redacted, the status and the duration: never the query string, cookies,
// headers or bodies.

/** `/t/:token` and `/order/:token/*` (either language) carry bearer tokens. */
const TOKEN_PATH = /^((?:\/fr)?\/(?:t|order)\/)[^/]+/i;

export function redactPath(pathname: string): string {
  return pathname.replace(TOKEN_PATH, "$1[redacted]");
}

export interface RequestLogLine {
  level: "info";
  event: "request";
  requestId: string;
  method: string;
  route: string;
  status: number;
  durationMs: number;
}

export function requestLogLine(request: Request, status: number, durationMs: number): RequestLogLine {
  return {
    level: "info",
    event: "request",
    requestId: request.headers.get("cf-ray") ?? crypto.randomUUID(),
    method: request.method,
    route: redactPath(new URL(request.url).pathname),
    status,
    durationMs,
  };
}
