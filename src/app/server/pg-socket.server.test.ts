// node-postgres corks the socket around a query's five messages; on Workers they must leave
// as one write, or Nagle adds a round trip per query (ADR-0003 amendment 3).
import { describe, expect, test } from "vitest";
import { withCork, workersSocketFactory } from "./pg-socket.server";

class RecordingSocket {
  readonly writes: Uint8Array[] = [];
  constructor(readonly ssl: boolean) {}
  write(data: Uint8Array | string, encodingOrCallback?: unknown, callback?: () => void) {
    this.writes.push(typeof data === "string" ? Buffer.from(data) : data);
    (typeof encodingOrCallback === "function" ? (encodingOrCallback as () => void) : callback)?.();
    return true;
  }
}

describe("withCork", () => {
  test("messages written between cork and uncork leave as one write, in order", () => {
    const socket = new (withCork(RecordingSocket))(true);

    socket.cork();
    for (const message of ["P", "B", "D", "E", "S"]) socket.write(Buffer.from(message));
    expect(socket.writes).toHaveLength(0);
    socket.uncork();

    expect(socket.writes.map((w) => Buffer.from(w).toString())).toEqual(["PBDES"]);
  });

  test("uncorked writes pass straight through and callbacks still run", () => {
    const socket = new (withCork(RecordingSocket))(false);
    let called = 0;

    socket.write(Buffer.from("Q"), () => void called++);
    socket.cork();
    socket.write("x", "utf8", () => void called++);
    socket.uncork();
    socket.uncork();

    expect(socket.writes.map((w) => Buffer.from(w).toString())).toEqual(["Q", "x"]);
    expect(called).toBe(2);
  });

  test("outside Workers there is no factory: Node's own socket corks", () => {
    expect(workersSocketFactory()).toBeUndefined();
  });
});
