/**
 * The cloud side of sync (sync.ts) on Supabase. Every query runs as the signed-in person, so
 * row-level security limits it to their own rows; user_id is still sent explicitly, so a
 * mismatch is refused by the policy instead of silently written elsewhere.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectMeta } from "@/model/library";
import type { ActivityEvent, VersionMeta } from "@/lib/workspace/types";
import type { Remote, RemoteProfile } from "./sync";

/** Fail loudly: sync treats any throw as "try again later" and keeps its base unchanged. */
function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

const chunks = <T>(list: T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
const iso = (ms: number) => new Date(ms).toISOString();

export function supabaseRemote(sb: SupabaseClient, userId: string): Remote {
  return {
    async plans() {
      const rows = must(await sb.from("projects").select("id, meta, deleted_at").eq("user_id", userId)) as { id: string; meta: ProjectMeta; deleted_at: string | null }[];
      return rows.map((r) => ({ id: r.id, meta: r.meta, deleted: r.deleted_at !== null }));
    },

    async planDocs(ids) {
      const out: Record<string, string> = {};
      // documents can be large: a few at a time
      for (const part of chunks(ids, 5)) {
        if (!part.length) continue;
        const rows = must(await sb.from("projects").select("id, document").eq("user_id", userId).in("id", part)) as { id: string; document: unknown }[];
        for (const r of rows) out[r.id] = JSON.stringify(r.document);
      }
      return out;
    },

    async putPlans(rows) {
      const whole = rows.filter((r) => r.doc !== undefined);
      const metaOnly = rows.filter((r) => r.doc === undefined);
      for (const part of chunks(whole, 5)) {
        must(
          await sb.from("projects").upsert(
            part.map((r) => ({ user_id: userId, id: r.id, meta: r.meta, document: JSON.parse(r.doc!), updated_at: iso(Date.now()), deleted_at: null })),
            { onConflict: "user_id,id" },
          ),
        );
      }
      for (const r of metaOnly) must(await sb.from("projects").update({ meta: r.meta, updated_at: iso(Date.now()) }).eq("user_id", userId).eq("id", r.id));
    },

    async deletePlans(ids) {
      if (!ids.length) return;
      // keep a tombstone so other devices delete their copy too; drop the heavy parts
      must(await sb.from("projects").update({ deleted_at: iso(Date.now()), document: {}, updated_at: iso(Date.now()) }).eq("user_id", userId).in("id", ids));
      must(await sb.from("project_versions").delete().eq("user_id", userId).in("project_id", ids));
    },

    async versions() {
      const rows = must(await sb.from("project_versions").select("project_id, meta").eq("user_id", userId)) as { project_id: string; meta: VersionMeta }[];
      return rows.map((r) => ({ planId: r.project_id, meta: r.meta }));
    },

    async versionDocs(planId, ids) {
      const out: Record<string, string> = {};
      for (const part of chunks(ids, 5)) {
        const rows = must(await sb.from("project_versions").select("id, document").eq("user_id", userId).eq("project_id", planId).in("id", part)) as { id: string; document: unknown }[];
        for (const r of rows) out[r.id] = JSON.stringify(r.document);
      }
      return out;
    },

    async putVersions(rows) {
      for (const part of chunks(rows, 5)) {
        must(
          await sb.from("project_versions").upsert(
            part.map((r) => ({ user_id: userId, project_id: r.planId, id: r.meta.id, meta: r.meta, document: JSON.parse(r.doc), created_at: iso(r.meta.at) })),
            { onConflict: "user_id,project_id,id" },
          ),
        );
      }
    },

    async deleteVersions(planId, ids) {
      if (!ids.length) return;
      must(await sb.from("project_versions").delete().eq("user_id", userId).eq("project_id", planId).in("id", ids));
    },

    async events(limit) {
      const rows = must(await sb.from("activity").select("event").eq("user_id", userId).order("at", { ascending: false }).limit(limit)) as { event: ActivityEvent }[];
      return rows.map((r) => r.event);
    },

    async putEvents(events) {
      for (const part of chunks(events, 100)) {
        must(await sb.from("activity").upsert(part.map((e) => ({ user_id: userId, id: e.id, at: iso(e.at), event: e })), { onConflict: "user_id,id" }));
      }
    },

    async profile() {
      const rows = must(await sb.from("profiles").select("name, hue, role, created_at").eq("id", userId).limit(1)) as { name: string; hue: number; role: string; created_at: string }[];
      const r = rows[0];
      return r ? ({ name: r.name, hue: r.hue, role: r.role, since: Date.parse(r.created_at) } satisfies RemoteProfile) : null;
    },

    async putProfile(p) {
      must(await sb.from("profiles").update({ name: p.name.slice(0, 80), hue: Math.round(p.hue) % 360, role: p.role.slice(0, 80), updated_at: iso(Date.now()) }).eq("id", userId));
    },
  };
}
