// Turnstile on the account forms (S-206 AC6, S-207 AC10, S-208 AC6, S-209 AC5, S-215 AC7): a failed
// bot check is BOT_CHECK_FAILED and nothing is sent; without keys the check is skipped (tested
// everywhere else, where no check is configured).
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { routeArgs } from "~/server/testing/route-context";
import { type TurnstileCheck, turnstileContext } from "~/server/turnstile.server";
import { action as resetAction } from "./reset";
import { action as signInAction } from "./sign-in";
import { action as signUpAction } from "./sign-up";

let database: TestDatabase;
let auth: FakeAuth;
const seen: (string | undefined)[] = [];
const failing: TurnstileCheck = {
  siteKey: "test-site-key",
  verify: async (token) => {
    seen.push(token);
    return token === "good-token" ? "ok" : "failed";
  },
};

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(async () => {
  auth = new FakeAuth();
  seen.length = 0;
  await database.client.exec("delete from rate_limit_bucket");
});

afterAll(async () => {
  await database.close();
});

type Envelope = { data: { error: { code: string } }; init: { status: number } };

function args(path: string, form: Record<string, string>) {
  const built = routeArgs(database, { path, auth, form });
  built.context.set(turnstileContext, failing);
  return built as never;
}

describe("bot check on the account forms", () => {
  test("sign-up, sign-in (password and link) and reset refuse a missing or bad token and call Auth for nothing", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const answers = (await Promise.all([
      signUpAction(args("/account/sign-up", { name: "A B", email: "new@example.com", phone: "5712 3456", locale: "en" })),
      signInAction(args("/account/sign-in", { intent: "password", email: customer.email, password: "correct horse battery", turnstileToken: "bad" })),
      signInAction(args("/account/sign-in", { intent: "magicLink", email: customer.email })),
      resetAction(args("/account/reset", { intent: "requestReset", email: customer.email })),
    ])) as unknown as Envelope[];

    for (const answer of answers) {
      expect(answer.init.status).toBe(400);
      expect(answer.data.error.code).toBe("BOT_CHECK_FAILED");
    }
    expect(auth.signUps).toEqual([]);
    expect(auth.signInLinks).toEqual([]);
    expect(auth.recoveryRequests).toEqual([]);
    expect(auth.attempts).toEqual([]);
  });

  test("a good token goes through", async () => {
    const answer = await signUpAction(args("/account/sign-up", { name: "A B", email: "ok@example.com", phone: "5712 3456", locale: "en", turnstileToken: "good-token" }));
    expect(answer).toMatchObject({ ok: true });
    expect(seen).toEqual(["good-token"]);
  });
});
