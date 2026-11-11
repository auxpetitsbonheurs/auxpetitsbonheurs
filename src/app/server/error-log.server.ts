// One structured line for a loader/action/render error (NFR-004): the error's first message
// line and its cause chain (name, code, message), so a staging 500 names the driver error
// behind drizzle's "Failed query". Never query parameters, details, stacks or PII.

const TOKEN_PATH = /((?:\/fr)?\/(?:t|order)\/)[^/\s"']+/gi;

function redact(text: string): string {
  return text
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'@/]*@[^\s"']+/gi, "[redacted-url]")
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[redacted-email]")
    .replace(/\+?\d[\d ()-]{6,}\d/g, "[redacted-number]")
    .replace(TOKEN_PATH, "$1[redacted]")
    .slice(0, 600);
}

const firstLine = (text: string) => text.split("\n", 1)[0] ?? "";

export interface ErrorCause {
  name: string;
  code?: string;
  message: string;
}

export interface ServerErrorLogLine {
  level: "error";
  event: "server_error";
  method: string;
  route: string;
  error: string;
  causes: ErrorCause[];
}

export function serverErrorLogLine(error: unknown, method: string, pathname: string): ServerErrorLogLine {
  const causes: ErrorCause[] = [];
  const seen = new Set<unknown>([error]);
  let cause = error instanceof Error ? error.cause : undefined;
  while (cause instanceof Error && !seen.has(cause) && causes.length < 5) {
    seen.add(cause);
    const code = (cause as { code?: unknown }).code;
    causes.push({ name: cause.name, ...(typeof code === "string" ? { code } : {}), message: redact(firstLine(cause.message)) });
    cause = cause.cause;
  }
  return {
    level: "error",
    event: "server_error",
    method,
    route: redact(pathname),
    error: error instanceof Error ? redact(`${error.name}: ${firstLine(error.message)}`) : "non-error thrown",
    causes,
  };
}
