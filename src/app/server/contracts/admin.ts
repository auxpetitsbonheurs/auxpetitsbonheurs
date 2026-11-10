// Admin app action inputs (contracts.md "Admin app").
import { z } from "zod";
import { Email } from "./shared";

/** `admin/login` signIn. Field problems are reported per field; the password is never echoed. */
export const SignInInput = z.object({
  email: Email,
  password: z.string().min(1).max(1024),
});

export type SignInField = "email" | "password";

/** Which fields are wrong, and how: an empty email reads differently from a malformed one. */
export function signInProblems(form: Record<string, unknown>): Partial<Record<SignInField, "missing" | "format">> {
  const email = typeof form.email === "string" ? form.email.trim() : "";
  const password = typeof form.password === "string" ? form.password : "";
  const problems: Partial<Record<SignInField, "missing" | "format">> = {};
  if (email === "") problems.email = "missing";
  else if (!SignInInput.shape.email.safeParse(email).success) problems.email = "format";
  if (password === "" || password.length > 1024) problems.password = "missing";
  return problems;
}
