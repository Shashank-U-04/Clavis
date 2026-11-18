/**
 * The hackathon judges' demo account: creates it, or puts it back as it was.
 *
 *   npm run judges            create the account if needed, and make sure its password matches
 *   npm run judges -- reset   also wipe its plans, versions and history and seed them again
 *
 * Reads Supabase's URL and secret key from .env.local and never prints them. The account's
 * email and password are NEXT_PUBLIC_JUDGES_EMAIL / NEXT_PUBLIC_JUDGES_PASSWORD in .env.local
 * (public by design: the site footer shows them). If the password is not set yet, one is
 * generated and written there; copy both into Vercel's environment variables.
 *
 * The sample plans use fixed ids, so after a reset a judge's browser brings the original
 * versions back down instead of keeping edited copies.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { buildTemplate } from "@/lib/buildTemplate";
import { findTemplate } from "@/lib/catalogue";
import { toDocument } from "@/model/document";
import type { ProjectMeta } from "@/model/library";
import type { PlanModel } from "@/model/types";
import type { ActivityEvent, VersionMeta } from "@/lib/workspace/types";

const proc = (globalThis as unknown as { process: { env: Record<string, string | undefined>; argv: string[]; cwd(): string; exit(code: number): never } }).process;
nextEnv.loadEnvConfig(proc.cwd(), true);
const env = proc.env;
const reset = proc.argv.includes("reset");

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const secret = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) {
  console.log("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  proc.exit(1);
}

// ------------------------------------------------------------------------- email & password

const email = env.NEXT_PUBLIC_JUDGES_EMAIL || "judges@clavis.test";
let password = env.NEXT_PUBLIC_JUDGES_PASSWORD ?? "";
if (!env.NEXT_PUBLIC_JUDGES_EMAIL || !password) {
  // readable but not guessable: clavis-xxxx-xxxx-xxxx
  password ||= `clavis-${[0, 1, 2].map(() => crypto.randomBytes(3).toString("hex").slice(0, 4)).join("-")}`;
  const lines = [!env.NEXT_PUBLIC_JUDGES_EMAIL && `NEXT_PUBLIC_JUDGES_EMAIL=${email}`, !env.NEXT_PUBLIC_JUDGES_PASSWORD && `NEXT_PUBLIC_JUDGES_PASSWORD=${password}`].filter(Boolean);
  fs.appendFileSync(".env.local", `\n# The hackathon judges' demo account (public: shown in the site footer)\n${lines.join("\n")}\n`);
  console.log("Wrote the judges' email and password to .env.local. Copy both into Vercel (Config, Production and Preview).");
}

const admin = createClient(url!, secret!, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUser(): Promise<string | null> {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

// ------------------------------------------------------------------------------ sample plans

const SAMPLES: { id: string; slug: string; starred?: boolean; version?: string }[] = [
  { id: "judges-sunset-loft", slug: "sunset-loft", starred: true, version: "As first laid out" },
  { id: "judges-family-house", slug: "family-house", version: "First draft" },
  { id: "judges-compact-two-bedroom", slug: "compact-two-bedroom" },
  { id: "judges-studio-apartment", slug: "studio-apartment" },
];

const area = (m: PlanModel) => Math.round(m.rooms.reduce((t, r) => t + r.w * r.h, 0) * 10) / 10;

async function seed(userId: string) {
  const now = Date.now();
  const projects: Record<string, unknown>[] = [];
  const versions: Record<string, unknown>[] = [];
  const events: Record<string, unknown>[] = [];
  SAMPLES.forEach((s, i) => {
    const model = buildTemplate(s.slug);
    const at = now - (SAMPLES.length - i) * 3600_000;
    const meta: ProjectMeta = {
      id: s.id,
      name: findTemplate(s.slug)?.name ?? model.name,
      updatedAt: at,
      createdAt: at,
      rooms: model.rooms.length,
      area: area(model),
      source: `template:${s.slug}`,
      ...(s.starred && { starred: true }),
    };
    projects.push({ user_id: userId, id: s.id, meta, document: toDocument(model, [], new Date(at).toISOString()), updated_at: new Date(at).toISOString(), deleted_at: null });
    const created: ActivityEvent = { id: `${s.id}-created`, at, kind: "created", planId: s.id, planName: meta.name, detail: `from the ${meta.name} template` };
    events.push({ user_id: userId, id: created.id, at: new Date(at).toISOString(), event: created });
    if (s.version) {
      const v: VersionMeta = { id: `${s.id}-v1`, at: at + 60_000, label: s.version, auto: false, rooms: meta.rooms, area: meta.area };
      versions.push({ user_id: userId, project_id: s.id, id: v.id, meta: v, document: toDocument({ ...model, underlay: null }, [], new Date(v.at).toISOString()), created_at: new Date(v.at).toISOString() });
      const saved: ActivityEvent = { id: `${s.id}-v1-saved`, at: v.at, kind: "version_saved", planId: s.id, planName: meta.name, detail: v.label };
      events.push({ user_id: userId, id: saved.id, at: new Date(v.at).toISOString(), event: saved });
    }
  });
  const must = (r: { error: { message: string } | null }, what: string) => {
    if (r.error) throw new Error(`${what}: ${r.error.message}`);
  };
  must(await admin.from("projects").upsert(projects, { onConflict: "user_id,id" }), "plans");
  must(await admin.from("project_versions").upsert(versions, { onConflict: "user_id,project_id,id" }), "versions");
  must(await admin.from("activity").upsert(events, { onConflict: "user_id,id" }), "history");
  must(await admin.from("profiles").update({ name: "Hackathon judges", role: "judging Clavis", updated_at: new Date().toISOString() }).eq("id", userId), "profile");
  console.log(`Seeded ${projects.length} sample plans, ${versions.length} saved versions and ${events.length} history entries.`);
}

// ----------------------------------------------------------------------------------------- run

let userId = await findUser();
if (!userId) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: "Hackathon judges" } });
  if (error) throw error;
  userId = data.user.id;
  console.log(`Created the judges' account (${email}).`);
} else {
  const { error } = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
  if (error) throw error;
  console.log(`The judges' account (${email}) exists; its password matches .env.local.`);
}

const { count } = await admin.from("projects").select("id", { count: "exact", head: true }).eq("user_id", userId).is("deleted_at", null);
if (reset || !count) {
  if (reset) {
    for (const table of ["project_versions", "activity", "projects", "assistant_usage"] as const) {
      const { error } = await admin.from(table).delete().eq("user_id", userId);
      if (error) throw new Error(`clearing ${table}: ${error.message}`);
    }
    console.log("Cleared the account's plans, versions, history and today's AI count.");
  }
  await seed(userId);
} else console.log(`It already has ${count} plan(s); run "npm run judges -- reset" to restore the samples.`);
