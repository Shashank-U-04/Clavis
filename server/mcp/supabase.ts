/**
 * The MCP server's wiring to Supabase: tokens kept in each account's app metadata (only the
 * service role can write it, so nobody can mint a token for themselves from the browser),
 * and a person's plans through the same Remote the browser syncs with.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseRemote } from "@/lib/account/supabaseRemote";
import { readStored, type StoredToken, type TokenVault } from "./tokens";
import { remoteStore, type PlanStore } from "./store";

const KEY = "mcp_tokens";

export function metadataVault(admin: SupabaseClient): TokenVault {
  return {
    async read(userId) {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || !data?.user) return null;
      return readStored((data.user.app_metadata as Record<string, unknown> | undefined)?.[KEY]);
    },
    async write(userId, tokens: StoredToken[]) {
      const { error } = await admin.auth.admin.updateUserById(userId, { app_metadata: { [KEY]: tokens } });
      if (error) throw new Error(error.message);
    },
  };
}

export const accountStore = (admin: SupabaseClient, userId: string): PlanStore => remoteStore(supabaseRemote(admin, userId));
