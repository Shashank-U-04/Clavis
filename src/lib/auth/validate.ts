/** Form rules for the judges' sign-in form. */

import { z } from "zod";

export const email = z.string().trim().min(1, "Enter the email address.").email("That doesn't look like an email address.");

export const SignInSchema = z.object({ email, password: z.string().min(1, "Enter the password.") });
export type FieldErrors = Partial<Record<string, string>>;

export function errorsOf(result: z.ZodSafeParseResult<unknown>): FieldErrors {
  if (result.success) return {};
  const out: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
