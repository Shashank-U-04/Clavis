/**
 * The hackathon judges' demo account. Its email and password are public on purpose (shown in
 * the site footer and prefilled on the sign-in page), so they come from the deployment's
 * settings, never the code: NEXT_PUBLIC_JUDGES_EMAIL and NEXT_PUBLIC_JUDGES_PASSWORD. The
 * account holds sample plans only; `npm run judges -- reset` puts it back as it was.
 */

export const JUDGES_EMAIL = process.env.NEXT_PUBLIC_JUDGES_EMAIL ?? "";
export const JUDGES_PASSWORD = process.env.NEXT_PUBLIC_JUDGES_PASSWORD ?? "";

export const judgesLoginShown = (): boolean => JUDGES_EMAIL.length > 0 && JUDGES_PASSWORD.length > 0;
