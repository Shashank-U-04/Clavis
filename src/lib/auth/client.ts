/**
 * What the sign-in forms call. Supabase is connected in the accounts phase; until then every
 * action answers honestly instead of pretending: accounts are not switched on yet.
 */

import { authConfigured } from "./config";

export type AuthResult = { ok: true; message?: string } | { ok: false; code: "not_configured" | "unavailable"; message: string };

const notYet = (): AuthResult =>
  authConfigured()
    ? { ok: false, code: "unavailable", message: "Accounts are being connected. Please try again soon." }
    : { ok: false, code: "not_configured", message: "Accounts aren't switched on yet. The studio works fully without one, and saves your projects in this browser." };

export const auth = {
  signInWithPassword: async (_email: string, _password: string): Promise<AuthResult> => notYet(),
  sendMagicLink: async (_email: string): Promise<AuthResult> => notYet(),
  signUp: async (_name: string, _email: string, _password: string): Promise<AuthResult> => notYet(),
  signInWithGitHub: async (): Promise<AuthResult> => notYet(),
  requestPasswordReset: async (_email: string): Promise<AuthResult> => notYet(),
  updatePassword: async (_password: string): Promise<AuthResult> => notYet(),
};
