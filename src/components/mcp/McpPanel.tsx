"use client";

/**
 * Connect an AI agent to Clavis over MCP: the server address, the person's access tokens
 * (make one, see it once, revoke it), a ready config to paste into the agent's MCP settings,
 * and what the agent can do. Opened from the MCP button in the app's top bar, the studio's
 * header and Settings.
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { authConfigured } from "@/lib/auth/config";

type Access = "read" | "edit";
interface TokenInfo {
  id: string;
  name: string;
  access: Access;
  created: number;
  used?: number;
}

export const MCP_TOOLS: [string, string][] = [
  ["list_plans", "your plans, newest first"],
  ["get_plan", "one plan in full: floors, rooms, walls, doors, windows, furniture, checks"],
  ["check_plan", "run the checks: sizes, doors, clearances, routes, walkability"],
  ["create_plan", "a new plan from a template, a one-line brief, or empty"],
  ["apply_operations", "edit a plan with the studio's own checked operations"],
  ["describe_operations", "every operation and its fields"],
  ["list_catalog", "the furniture and building pieces, with sizes"],
  ["list_templates", "the templates a plan can start from"],
];

const date = (ms?: number) => (ms ? new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "never");

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        });
      }}
      className="label flex shrink-0 items-center gap-1.5 border border-rule px-3 py-2 text-[0.68rem] hover:border-ink"
      aria-label={label}
    >
      {done ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function Field({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-stretch gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap border border-rule bg-paper-2 px-3 py-2 font-mono text-[0.78rem]">{value}</code>
      <CopyButton text={value} label={label} />
    </div>
  );
}

export function mcpConfig(url: string, token: string): string {
  return JSON.stringify({ mcpServers: { clavis: { type: "http", url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);
}

export function McpPanel() {
  const [origin, setOrigin] = useState("");
  const [tokens, setTokens] = useState<TokenInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [access, setAccess] = useState<Access>("edit");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const on = authConfigured();
  const url = `${origin}/api/mcp`;

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/mcp/tokens", { cache: "no-store" });
      const body = await r.json();
      if (!body.ok) throw new Error(body.message);
      setTokens(body.tokens);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your tokens could not be read.");
      setTokens([]);
    }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    if (on) void load();
  }, [on, load]);

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/mcp/tokens", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, access }) });
      const body = await r.json();
      if (!body.ok) throw new Error(body.message);
      setFresh(body.token);
      setName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The token could not be made.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setError(null);
    try {
      const r = await fetch(`/api/mcp/tokens?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await r.json();
      if (!body.ok) throw new Error(body.message);
      setConfirm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The token could not be revoked.");
    }
  };

  const radio = "flex cursor-pointer items-start gap-2.5 border border-rule p-3 has-[:checked]:border-ink has-[:checked]:bg-paper-2";

  return (
    <div className="grid gap-7 text-ink">
      <p className="max-w-prose text-sm text-ink-2">
        Let an AI agent you use read and edit your Clavis plans through MCP (Model Context Protocol). It works with the same checked operations as the studio’s assistant, and every change it saves keeps the plan’s previous state as a version you can restore.
      </p>

      <section className="grid gap-2">
        <h3 className="label text-[0.68rem] text-ink-3">Server address</h3>
        {origin && <Field value={url} label="Copy the server address" />}
        <p className="text-xs text-ink-3">Streamable HTTP. Send the token as a bearer token: Authorization: Bearer clv_…</p>
      </section>

      <section className="grid gap-3">
        <h3 className="label text-[0.68rem] text-ink-3">Access tokens</h3>
        {!on ? (
          <p className="border border-dashed border-rule p-4 text-sm text-ink-2">Accounts are not switched on here, so there are no plans for an agent to work on.</p>
        ) : (
          <>
            {fresh && (
              <div className="grid gap-3 border border-marker bg-marker-soft/40 p-4" role="status">
                <p className="text-sm font-semibold">Your new token. Copy it now: it is shown only once.</p>
                <Field value={fresh} label="Copy the token" />
                <p className="text-sm text-ink-2">Or paste this into your agent’s MCP settings:</p>
                <div className="flex items-start gap-2">
                  <pre className="min-w-0 flex-1 overflow-x-auto border border-rule bg-paper-2 p-3 font-mono text-[0.74rem] leading-relaxed">{mcpConfig(url, fresh)}</pre>
                  <CopyButton text={mcpConfig(url, fresh)} label="Copy the MCP config" />
                </div>
                <button type="button" onClick={() => setFresh(null)} className="label justify-self-start text-[0.68rem] text-ink-3 hover:text-ink">
                  I’ve saved it
                </button>
              </div>
            )}

            {tokens === null ? (
              <p className="text-sm text-ink-3">Loading your tokens…</p>
            ) : tokens.length === 0 ? (
              <p className="text-sm text-ink-3">No tokens yet.</p>
            ) : (
              <ul className="border-t border-rule">
                {tokens.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule py-3">
                    <KeyRound size={15} className="text-ink-3" aria-hidden="true" />
                    <span className="font-semibold">{t.name}</span>
                    <span className="label text-[0.62rem] text-ink-3">{t.access === "edit" ? "Read + edit" : "Read only"}</span>
                    <span className="text-xs text-ink-3">
                      made {date(t.created)} · last used {date(t.used)}
                    </span>
                    <span className="flex-1" />
                    {confirm === t.id ? (
                      <span className="flex gap-2">
                        <button type="button" onClick={() => void revoke(t.id)} className="label bg-marker px-3 py-1.5 text-[0.66rem] text-paper">
                          Revoke
                        </button>
                        <button type="button" onClick={() => setConfirm(null)} className="label border border-rule px-3 py-1.5 text-[0.66rem]">
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirm(t.id)} className="label flex items-center gap-1.5 text-[0.66rem] text-ink-3 hover:text-marker" aria-label={`Revoke ${t.name}`}>
                        <Trash2 size={13} aria-hidden="true" /> Revoke
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <form
              className="grid gap-3 border border-rule p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void make();
              }}
            >
              <label className="grid gap-1.5 text-sm">
                <span className="font-semibold">Name it after the agent</span>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="For example: laptop agent" className="border border-rule bg-paper px-3 py-2 outline-none focus:border-ink" />
              </label>
              <fieldset className="grid gap-2 sm:grid-cols-2">
                <legend className="sr-only">What the agent may do</legend>
                <label className={radio}>
                  <input type="radio" name="mcp-access" checked={access === "edit"} onChange={() => setAccess("edit")} className="mt-1 accent-ink" />
                  <span className="text-sm">
                    <span className="block font-semibold">Read and edit</span>
                    <span className="text-ink-2">Make plans and change them.</span>
                  </span>
                </label>
                <label className={radio}>
                  <input type="radio" name="mcp-access" checked={access === "read"} onChange={() => setAccess("read")} className="mt-1 accent-ink" />
                  <span className="text-sm">
                    <span className="block font-semibold">Read only</span>
                    <span className="text-ink-2">Look at plans and their checks.</span>
                  </span>
                </label>
              </fieldset>
              <button type="submit" disabled={busy || (tokens?.length ?? 0) >= 5} className="label justify-self-start bg-ink px-4 py-2.5 text-paper hover:bg-marker disabled:opacity-40">
                {busy ? "Making it…" : "Make a token"}
              </button>
              {(tokens?.length ?? 0) >= 5 && <p className="text-xs text-ink-3">Up to five tokens. Revoke one to make another.</p>}
            </form>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-marker">
            {error}
          </p>
        )}
      </section>

      <section className="grid gap-2">
        <h3 className="label text-[0.68rem] text-ink-3">What an agent can do</h3>
        <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
          {MCP_TOOLS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-mono text-[0.78rem]">{k}</dt>
              <dd className="text-ink-2">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-1 text-xs text-ink-3">Removing walls, rooms, furniture or a floor needs the agent to say so explicitly; it should ask you first. Changes reach the app and studio when they next sync.</p>
      </section>
    </div>
  );
}
