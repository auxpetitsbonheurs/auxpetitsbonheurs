// Server-Timing for one request (perf investigation, ADR-0003 amendment 2026-11-11): the
// database connection, each named read and the app. Names are fixed labels chosen in code
// and reduced to safe tokens; never SQL, parameters or personal data.
import { type RouterContextProvider, createContext } from "react-router";

const token = (name: string) => name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "step";
const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]+/g, "").trim().slice(0, 40);
const round = (ms: number) => Math.round(ms * 10) / 10;

export class ServerTiming {
  private readonly entries: { name: string; dur: number; desc?: string }[] = [];
  private readonly uses = new Map<string, number>();
  constructor(private readonly now: () => number = () => performance.now()) {}

  add(name: string, durationMs: number, description?: string): void {
    const base = token(name);
    const count = (this.uses.get(base) ?? 0) + 1;
    this.uses.set(base, count);
    this.entries.push({ name: count === 1 ? base : `${base}-${count}`, dur: round(durationMs), desc: description === undefined ? undefined : words(description) });
  }

  async measure<T>(name: string, step: () => Promise<T>): Promise<T> {
    const started = this.now();
    try {
      return await step();
    } finally {
      this.add(name, this.now() - started);
    }
  }

  /** The Server-Timing header value, or null when nothing was recorded. */
  header(): string | null {
    if (this.entries.length === 0) return null;
    return this.entries.map((e) => `${e.name};dur=${e.dur}${e.desc ? `;desc="${e.desc}"` : ""}`).join(", ");
  }
}

/** The request's timing; absent in unit tests and jobs. */
export const serverTimingContext = createContext<ServerTiming | null>(null);

/** Runs `step`, recording its duration under `name` when the request has a timing. */
export function timed<T>(context: Readonly<RouterContextProvider>, name: string, step: () => Promise<T>): Promise<T> {
  const timing = context.get(serverTimingContext);
  return timing ? timing.measure(name, step) : step();
}
