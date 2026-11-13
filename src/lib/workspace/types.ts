/**
 * The workspace: everything a person has in Clavis besides the design being edited — their
 * plans, each plan's saved versions, the history of what they did, and their profile.
 *
 * Today it lives in this browser (see browser.ts). With accounts, the same shapes move to
 * Supabase tables (projects, project_versions, activity, profiles), and the pages do not
 * change. See docs/APP_ARCHITECTURE.md.
 */

import type { PlanSource, ProjectMeta } from "@/model/library";

export type { PlanSource };
export type Plan = ProjectMeta;

/** A saved snapshot of one plan. The document itself is stored beside it, not in the list. */
export interface VersionMeta {
  id: string;
  at: number;
  /** a name given in the studio, or the reason an automatic checkpoint was taken */
  label: string;
  /** taken by the app (a checkpoint), not saved by the person */
  auto: boolean;
  rooms: number;
  area: number;
}

export type ActivityKind =
  | "created"
  | "opened"
  | "edited"
  | "renamed"
  | "duplicated"
  | "imported"
  | "version_saved"
  | "restored"
  | "starred"
  | "deleted"
  | "exported";

export interface ActivityEvent {
  id: string;
  at: number;
  kind: ActivityKind;
  planId: string;
  /** the plan's name at the time, so the history still reads after a rename or delete */
  planName: string;
  /** a short extra line: the source, the old name, the version label… */
  detail?: string;
  /** for folded "edited" events: how many saves were folded into this one */
  count?: number;
}

export interface Profile {
  name: string;
  /** hue of the avatar, 0–359 */
  hue: number;
  /** what the person designs for: their own home, clients, study… */
  role: string;
  /** when this browser first saw them */
  since: number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; message: string };
