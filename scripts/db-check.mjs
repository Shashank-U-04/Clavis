// Proves row-level security on the live Supabase project with two throwaway accounts, then
// deletes them. Reads keys from .env.local and prints only PASS/FAIL lines.  npm run db:check
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/package.json");
const { createClient } = require("@supabase/supabase-js");

const env = {};
for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, PUB = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SECRET = env.SUPABASE_SERVICE_ROLE_KEY;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, SECRET, opts);
const pw = "T3st-" + Math.random().toString(36).slice(2) + "-Aa9!";
const stamp = Date.now();
const made = [];
const check = (label, ok) => console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);

async function user(tag) {
  const email = `rls-${tag}-${stamp}@clavis.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { name: `Test ${tag}` } });
  if (error) throw new Error(`createUser ${tag}: ${error.message}`);
  made.push(data.user.id);
  const c = createClient(URL_, PUB, opts);
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw new Error(`signIn ${tag}: ${s.error.message}`);
  return { c, id: data.user.id };
}

try {
  const a = await user("a");
  const b = await user("b");
  const anon = createClient(URL_, PUB, opts);

  const prof = await a.c.from("profiles").select("name").single();
  check("a profile is created on sign-up, named from metadata", prof.data?.name === "Test a");

  const ins = await a.c.from("projects").insert({ id: "p1", meta: { name: "A's plan" }, document: { v: 1 } });
  check("A can save a plan", !ins.error);
  check("A reads their plan", (await a.c.from("projects").select("id")).data?.length === 1);
  check("B cannot see A's plan", (await b.c.from("projects").select("id")).data?.length === 0);
  const upd = await b.c.from("projects").update({ meta: { name: "hacked" } }).eq("id", "p1").select();
  check("B cannot change A's plan", (upd.data ?? []).length === 0);
  const forge = await b.c.from("projects").insert({ user_id: a.id, id: "p2", meta: {}, document: {} });
  check("B cannot write a plan into A's account", !!forge.error);
  const anonRead = await anon.from("projects").select("id");
  check("a guest reads no plans", !!anonRead.error || (anonRead.data ?? []).length === 0);
  check("B cannot read A's profile", (await b.c.from("profiles").select("id").eq("id", a.id)).data?.length === 0);

  const selfGrant = await a.c.rpc("consume_assistant_request", { p_user: a.id, p_cap: 1000 });
  check("a person cannot call the allowance function themselves", !!selfGrant.error);
  const usageWrite = await a.c.from("assistant_usage").insert({ user_id: a.id, day: "2026-01-01", count: 0 });
  check("a person cannot write their own allowance", !!usageWrite.error);

  const r1 = await admin.rpc("consume_assistant_request", { p_user: a.id, p_cap: 2 });
  const r2 = await admin.rpc("consume_assistant_request", { p_user: a.id, p_cap: 2 });
  const r3 = await admin.rpc("consume_assistant_request", { p_user: a.id, p_cap: 2 });
  check(`server allowance counts down 1, 0, then refuses (-1): got ${r1.data}, ${r2.data}, ${r3.data}`, r1.data === 1 && r2.data === 0 && r3.data === -1);
  await admin.rpc("refund_assistant_request", { p_user: a.id });
  const r4 = await admin.rpc("consume_assistant_request", { p_user: a.id, p_cap: 2 });
  check("a refund gives one back", r4.data === 0);
  check("A can read their own usage", (await a.c.from("assistant_usage").select("count")).data?.[0]?.count === 2);
} catch (e) {
  console.log("ERROR", e.message);
} finally {
  for (const id of made) await admin.auth.admin.deleteUser(id);
  console.log(`cleaned up ${made.length} test account(s)`);
}
