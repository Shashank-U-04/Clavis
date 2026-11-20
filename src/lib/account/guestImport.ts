/**
 * Plans made as a guest, before signing in, live in the guest's part of this browser. Signing
 * in moves them into the account (with their versions), so sync takes them to the cloud: being
 * a guest and having an account are one way of working, not two separate places for plans.
 */

import { INDEX_KEY, listProjects, newProjectId, projectKey, type ProjectMeta } from "@/model/library";
import type { StorageLike } from "@/model/persistence";
import { logEvent, versionsKey } from "@/lib/workspace/browser";

/** One page load's note that guest plans just moved into the account, for a one-time notice. */
export const BROUGHT_ALONG_KEY = "clavis:brought-along";

export const GUEST_IMPORT_KEY = "clavis:guest-import";

/** Guest plans not yet brought into this account, or [] once the offer was taken or declined. */
export function guestPlansToOffer(guest: StorageLike | null, mine: StorageLike | null): ProjectMeta[] {
  if (!guest || !mine) return [];
  try {
    if (mine.getItem(GUEST_IMPORT_KEY)) return [];
  } catch {
    return [];
  }
  // a plan the account already has (brought along before, maybe on another device) is not offered again
  const have = new Set(listProjects(mine).map((p) => p.id));
  return listProjects(guest).filter((p) => !have.has(p.id) && !!guest.getItem(projectKey(p.id)));
}

export function declineGuestPlans(mine: StorageLike | null): void {
  try {
    mine?.setItem(GUEST_IMPORT_KEY, "declined");
  } catch {
    /* best effort */
  }
}

/** Copy the guest's plans into this account. Returns how many came across. */
export function importGuestPlans(guest: StorageLike, mine: StorageLike, now = Date.now()): number {
  const index = listProjects(mine);
  let moved = 0;
  for (const p of listProjects(guest)) {
    const text = guest.getItem(projectKey(p.id));
    if (!text) continue;
    // already here, unchanged: nothing to bring
    if (index.some((x) => x.id === p.id && x.updatedAt === p.updatedAt)) continue;
    // an id already used in this account (the same plan imported before, or a clash) gets a new one
    const id = index.some((x) => x.id === p.id) ? newProjectId() : p.id;
    try {
      mine.setItem(projectKey(id), text);
      const versions = guest.getItem(versionsKey(p.id));
      if (versions) mine.setItem(versionsKey(id), versions);
      index.push({ ...p, id });
      logEvent(mine, { at: now, kind: "imported", planId: id, planName: p.name, detail: "from this browser, made before signing in" });
      moved++;
    } catch {
      break; // storage full: stop here, keep what came across
    }
  }
  mine.setItem(INDEX_KEY, JSON.stringify(index.sort((a, b) => b.updatedAt - a.updatedAt)));
  mine.setItem(GUEST_IMPORT_KEY, "done");
  return moved;
}

/**
 * Move the guest's plans into this account: copy them across, then remove the guest's copies
 * of every plan the account now holds, so signing out later does not show stale duplicates.
 * Returns how many plans came across.
 */
export function moveGuestPlans(guest: StorageLike, mine: StorageLike, now = Date.now()): number {
  const offered = guestPlansToOffer(guest, mine);
  if (offered.length === 0) return 0;
  const moved = importGuestPlans(guest, mine, now);
  const held = new Set(listProjects(mine).map((p) => `${p.name}|${p.updatedAt}`));
  const left = listProjects(guest).filter((p) => {
    if (!held.has(`${p.name}|${p.updatedAt}`)) return true; // not across (storage full): keep it
    try {
      guest.removeItem(projectKey(p.id));
      guest.removeItem(versionsKey(p.id));
    } catch {
      return true;
    }
    return false;
  });
  try {
    guest.setItem(INDEX_KEY, JSON.stringify(left));
  } catch {
    /* the copies in the account are what matter */
  }
  return moved;
}
