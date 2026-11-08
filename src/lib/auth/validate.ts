/** Form rules shared by the sign-in pages (and, later, the server). */

import { z } from "zod";

export const email = z.string().trim().min(1, "Enter your email address.").email("That doesn't look like an email address.");
export const password = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128, "Use at most 128 characters.")
  .refine((p) => /[a-zA-Z]/.test(p) && /[^a-zA-Z]/.test(p), "Mix letters with at least one number or symbol.");

export const SignInSchema = z.object({ email, password: z.string().min(1, "Enter your password.") });
export const MagicLinkSchema = z.object({ email });
export const SignUpSchema = z.object({ name: z.string().trim().min(1, "Tell us what to call you.").max(80), email, password });
export const ResetSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "The two passwords don't match.", path: ["confirm"] });

/** 0–4: a rough, honest strength meter (length and variety), not a promise. */
export function passwordStrength(p: string): number {
  let s = 0;
  if (p.length >= 10) s++;
  if (p.length >= 14) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p) && /[^a-zA-Z0-9]/.test(p)) s++;
  return s;
}

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
