/** Typed business-rule error; routes map `code` to the error envelope (architecture: cross-cutting). */
export class DomainError extends Error {
  readonly code: string;
  /** Machine-readable extras for the envelope (e.g. `fields`, `lineIds`); never PII. */
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}
