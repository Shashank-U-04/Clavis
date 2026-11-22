// Checks the LIVE site end to end: health, the footer's judges' login, Google sign-in, the
// judges' sample plans, and cloud saving across two browsers with a throwaway account (deleted
// at the end). Reads keys from .env.local and prints only PASS/FAIL lines.
//   npm run check:live                          against https://clavisstudio.vercel.app
//   SITE=http://localhost:5199 npm run check:live   against a local server
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/package.json");
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");

const SITE = process.env.SITE ?? "https://clavisstudio.vercel.app";
const env = {};
for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

let failed = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  (${extra})` : ""}`);
};
const step = async (label, fn) => {
  try {
    await fn();
  } catch (e) {
    failed++;
    console.log(`FAIL  ${label}: ${String(e.message ?? e).split("\n")[0]}`);
  }
};

const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
const newDevice = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return { ctx, page, errors };
};

// ------------------------------------------------------------------ 1. health, footer, Google
await step("health", async () => {
  const r = await fetch(`${SITE}/api/health`);
  check("/api/health answers 200 (database reachable)", r.ok, `${r.status} ${(await r.text()).slice(0, 80)}`);
});

await step("footer and login page", async () => {
  const { ctx, page } = await newDevice();
  await page.goto(SITE);
  const text = await page.locator("footer").innerText();
  check("footer shows the judges' email", text.includes(env.NEXT_PUBLIC_JUDGES_EMAIL));
  check("footer shows the judges' password (matches .env.local)", text.includes(env.NEXT_PUBLIC_JUDGES_PASSWORD));
  await page.goto(`${SITE}/login`);
  await page.getByRole("button", { name: /Google/ }).first().click();
  await page.waitForURL(/accounts\.google\.com/, { timeout: 20000 });
  const u = new URL(page.url());
  check("Continue with Google reaches Google's sign-in", u.hostname === "accounts.google.com");
  const body = await page.locator("body").innerText();
  check("Google shows no 'access blocked' / testing error", !/access blocked|has not completed the Google verification|Error 403/i.test(body));
  await ctx.close();
});

await step("the studio needs an account", async () => {
  const { ctx, page } = await newDevice();
  await page.goto(`${SITE}/studio/try?template=linden-heights`);
  const u = new URL(page.url());
  check("signed out, the studio sends you to sign in", u.pathname === "/login", u.pathname);
  check("…and back to the studio afterwards", u.searchParams.get("next") === "/studio/try?template=linden-heights", u.searchParams.get("next") ?? "no next");
  const r = await fetch(`${SITE}/api/assistant`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  check("signed out, the assistant answers 401", r.status === 401, String(r.status));
  await ctx.close();
});

// ------------------------------------------------------------------ 2. the judges' account
await step("judges", async () => {
  const { ctx, page, errors } = await newDevice();
  await page.goto(`${SITE}/login`);
  await page.getByText("Hackathon judges: demo account").click();
  await page.getByRole("button", { name: "Sign in to the demo account" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  check("judges sign in with the prefilled form", true, new URL(page.url()).pathname);
  await page.goto(`${SITE}/plans`);
  for (const name of ["Linden Heights", "Cedar Villa", "Sunset Loft", "Compact two-bedroom"]) {
    const ok = await page.getByRole("link", { name: new RegExp(name, "i") }).first().waitFor({ timeout: 20000 }).then(() => true, () => false);
    check(`judges see "${name}"`, ok);
  }
  check("no page errors for the judges", errors.length === 0, errors[0]);
  await ctx.close();
});

// ------------------------------------------------------------------ 3. two devices, one account
const email = `live-check-${Date.now()}@clavis.test`;
const { data: made, error: mkErr } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { name: "Live Check" } });
if (mkErr) throw mkErr;
const uid = made.user.id;
const signIn = async (page) => {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  await page.goto(`${SITE}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink&next=/dashboard`);
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
};
const rows = async () => (await admin.from("projects").select("id, meta, deleted_at").eq("user_id", uid)).data ?? [];
const waitFor = async (fn, ms = 25000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
};

try {
  const A = await newDevice();
  const B = await newDevice();
  let plan;

  await step("device A", async () => {
    await signIn(A.page);
    check("device A signs in (one-time link)", true);
    await A.page.goto(`${SITE}/studio/try?template=compact-two-bedroom`);
    const r = await waitFor(async () => (await rows()).find((x) => !x.deleted_at));
    check("a plan made on device A reaches the database", !!r, r?.meta?.name);
    plan = r && { id: r.id, name: r.meta.name };
  });

  if (plan) {
    await step("device B", async () => {
      await signIn(B.page);
      await B.page.goto(`${SITE}/plans`);
      const seen = await B.page.getByRole("link", { name: plan.name }).first().waitFor({ timeout: 25000 }).then(() => true, () => false);
      check("device B (another browser) sees device A's plan", seen);
      await B.page.getByRole("button", { name: `Star ${plan.name}` }).first().click();
      const up = await waitFor(async () => (await rows()).find((x) => x.id === plan.id)?.meta?.starred);
      check("a star added on device B reaches the database", !!up);
    });

    await step("back on device A", async () => {
      await A.page.goto(`${SITE}/plans`);
      const ok = await A.page.getByRole("button", { name: `Unstar ${plan.name}` }).first().waitFor({ timeout: 40000 }).then(() => true, () => false);
      check("device A picks up the star from device B", ok);
    });

    await step("sign out", async () => {
      await A.page.goto(`${SITE}/profile`);
      await A.page.getByRole("button", { name: /Sign out/i }).first().click();
      // signing out sends any last changes first, then clears and goes home: wait for it to land
      // rather than a fixed time, and say what the page showed if it never does
      const home = await A.page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 30000 }).then(() => true, () => false);
      const said = home ? "" : await A.page.locator('[role="alert"], .text-marker, .bad').first().textContent({ timeout: 1000 }).catch(() => "");
      const left = await A.page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("clavis:u:")).length);
      check("signing out clears the account's copy from the browser", home && left === 0, home ? `${left} keys left` : `still on ${new URL(A.page.url()).pathname}${said ? `: ${said.trim()}` : ""}`);
      const still = (await rows()).filter((x) => !x.deleted_at).length;
      check("the plan is still in the account after signing out", still >= 1);
    });
  }
  check("no page errors on either device", A.errors.length + B.errors.length === 0, [...A.errors, ...B.errors][0]);
} finally {
  for (const t of ["project_versions", "activity", "projects", "assistant_usage"]) await admin.from(t).delete().eq("user_id", uid);
  await admin.auth.admin.deleteUser(uid);
  console.log("cleaned up the throwaway account");
  await browser.close();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall live checks passed");
process.exit(failed ? 1 : 0);
