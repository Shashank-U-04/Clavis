/**
 * Access tokens for Clavis's MCP server: how an outside AI agent proves whose plans it works
 * on. A person makes a token in the app (Settings, or the MCP button), pastes it into their
 * agent's MCP settings, and can revoke it at any time.
 *
 * A token reads `clv_<account id>_<secret>`. Only a SHA-256 hash of the secret is kept, in the
 * account's app metadata (which only the server can write), so nothing in the database can be
 * replayed as a token. Up to five tokens per account; each is "read" (look only) or "edit".
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type TokenAccess = "read" | "edit";

export interface StoredToken {
  id: string;
  name: string;
  access: TokenAccess;
  /** hex SHA-256 of the secret part */
  hash: string;
  created: number;
  /** last time an agent used it, to the hour */
  used?: number;
}

/** What the app shows: everything but the hash. */
export type TokenInfo = Omit<StoredToken, "hash">;

/** Where tokens are kept: the account's app metadata, through the service role. */
export interface TokenVault {
  read(userId: string): Promise<StoredToken[] | null>;
  write(userId: string, tokens: StoredToken[]): Promise<void>;
}

export const MAX_TOKENS = 5;
export const TOKEN_PREFIX = "clv_";
const USED_EVERY_MS = 60 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const info = ({ hash: _hash, ...t }: StoredToken): TokenInfo => t;

/** Read whatever the metadata holds, keeping only well-formed entries. */
export function readStored(raw: unknown): StoredToken[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (t): t is StoredToken =>
      !!t && typeof t.id === "string" && typeof t.name === "string" && typeof t.hash === "string" && typeof t.created === "number" && (t.access === "read" || t.access === "edit"),
  );
}

export function parseToken(token: string): { userId: string; secret: string } | null {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const rest = token.slice(TOKEN_PREFIX.length);
  const cut = rest.lastIndexOf("_");
  if (cut < 0) return null;
  const userId = rest.slice(0, cut);
  const secret = rest.slice(cut + 1);
  if (!UUID.test(userId) || !/^[A-Za-z0-9-]{32,}$/.test(secret)) return null;
  return { userId, secret };
}

export async function listTokens(vault: TokenVault, userId: string): Promise<TokenInfo[]> {
  return ((await vault.read(userId)) ?? []).map(info).sort((a, b) => b.created - a.created);
}

export type Created = { ok: true; token: string; info: TokenInfo } | { ok: false; message: string };

export async function createToken(vault: TokenVault, userId: string, name: string, access: TokenAccess, now = Date.now()): Promise<Created> {
  const list = (await vault.read(userId)) ?? [];
  if (list.length >= MAX_TOKENS) return { ok: false, message: `You can have up to ${MAX_TOKENS} tokens. Revoke one you no longer use first.` };
  const secret = randomBytes(24).toString("base64url").replace(/_/g, "-");
  const t: StoredToken = {
    id: randomBytes(6).toString("hex"),
    name: name.trim().slice(0, 60) || "Agent",
    access,
    hash: sha(secret),
    created: now,
  };
  await vault.write(userId, [...list, t]);
  return { ok: true, token: `${TOKEN_PREFIX}${userId}_${secret}`, info: info(t) };
}

export async function revokeToken(vault: TokenVault, userId: string, id: string): Promise<boolean> {
  const list = (await vault.read(userId)) ?? [];
  const kept = list.filter((t) => t.id !== id);
  if (kept.length === list.length) return false;
  await vault.write(userId, kept);
  return true;
}

export interface Caller {
  userId: string;
  tokenId: string;
  access: TokenAccess;
}

/** Who a bearer token belongs to, or null. Marks the token used, at most once an hour. */
export async function verifyToken(vault: TokenVault, token: string, now = Date.now()): Promise<Caller | null> {
  const parsed = parseToken(token.trim());
  if (!parsed) return null;
  const list = await vault.read(parsed.userId);
  if (!list) return null;
  const want = Buffer.from(sha(parsed.secret), "hex");
  const hit = list.find((t) => {
    const have = Buffer.from(t.hash, "hex");
    return have.length === want.length && timingSafeEqual(have, want);
  });
  if (!hit) return null;
  if (!hit.used || now - hit.used > USED_EVERY_MS) {
    try {
      await vault.write(parsed.userId, list.map((t) => (t.id === hit.id ? { ...t, used: now } : t)));
    } catch {
      /* the "last used" line is a nicety; the call goes ahead */
    }
  }
  return { userId: parsed.userId, tokenId: hit.id, access: hit.access };
}
