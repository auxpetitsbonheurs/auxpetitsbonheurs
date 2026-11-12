// Work that must not delay the visitor (ADR-0003 amendment 3): emails, web push, error
// reports, Storage clean-up. A request's deferred tasks wait until its response is ready
// (`release`), then run under ctx.waitUntil; the request's database client closes only after
// they settle. A failing task is logged (task name, error name and code: never messages that
// could carry personal data) and never reaches the customer. What must be true before the
// response (the order committed, the outbox row written) is never deferred.
import { createContext } from "react-router";

export type DeferredTask = () => Promise<unknown>;

export interface AfterResponse {
  /** Runs `work` after the response is ready. `task` is a fixed label for the logs. */
  defer(task: string, work: DeferredTask): void;
}

export interface AfterResponseQueue extends AfterResponse {
  /** The response is ready: queued tasks start, later ones start at once. */
  release(): void;
  /** Resolves when every task deferred so far (and any they defer) has finished or failed. */
  settled(): Promise<void>;
}

export interface DeferredFailureLine {
  level: "error";
  event: "deferred_task_failed";
  task: string;
  error: string;
  code?: string;
}

/** Name and code only: driver and HTTP messages can quote emails, phones or tokens. */
export function deferredFailureLine(task: string, error: unknown): DeferredFailureLine {
  const code = (error as { code?: unknown } | null)?.code;
  return {
    level: "error",
    event: "deferred_task_failed",
    task,
    error: error instanceof Error ? error.name : typeof error,
    ...(typeof code === "string" || typeof code === "number" ? { code: String(code) } : {}),
  };
}

const logFailure = (line: DeferredFailureLine) => console.error(JSON.stringify(line));

export function createAfterResponse(
  waitUntil: (promise: Promise<unknown>) => void,
  log: (line: DeferredFailureLine) => void = logFailure,
): AfterResponseQueue {
  const queued: { task: string; work: DeferredTask }[] = [];
  const running = new Set<Promise<void>>();
  let released = false;

  const start = (task: string, work: DeferredTask) => {
    const run: Promise<void> = Promise.resolve()
      .then(work)
      .then(
        () => undefined,
        (error: unknown) => log(deferredFailureLine(task, error)),
      )
      .finally(() => running.delete(run));
    running.add(run);
    waitUntil(run);
  };

  return {
    defer(task, work) {
      if (released) start(task, work);
      else queued.push({ task, work });
    },
    release() {
      if (released) return;
      released = true;
      for (const { task, work } of queued.splice(0)) start(task, work);
    },
    async settled() {
      while (running.size > 0) await Promise.all(running);
    },
  };
}

/** For services called outside a request (scripts, tests): runs the task now and waits for it. */
export const runInline: AfterResponse = {
  defer(task, work) {
    void work().catch((error: unknown) => logFailure(deferredFailureLine(task, error)));
  },
};

/** Route actions read the request's queue with `context.get(afterResponseContext)`. */
export const afterResponseContext = createContext<AfterResponse>(runInline);
