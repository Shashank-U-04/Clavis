"use client";

/**
 * Preferences that live in this browser: which assistant the studio uses, the layout it
 * opens in, and the data itself (download it all, or clear it). The account section waits
 * for accounts to be switched on.
 */

import { useEffect, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { authConfigured } from "@/lib/auth/config";

const PREFIX = "clavis:";
const PROVIDERS = [
  { value: "auto", label: "Auto", text: "Clavis Local first; the hosted model when a brief needs it." },
  { value: "local", label: "Clavis Local", text: "Rule-based, runs in your browser, nothing leaves it." },
  { value: "server", label: "Hosted model", text: "Every request goes to the hosted model when it is configured." },
] as const;
const LAYOUTS = [
  { value: "split", label: "Plan and 3D" },
  { value: "plan", label: "Plan only" },
  { value: "3d", label: "3D only" },
] as const;

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage blocked: the setting simply does not stick */
  }
};
const ownKeys = () => {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
  } catch {
    return [];
  }
};

function Row({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 border-b border-rule px-5 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:px-8">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 max-w-sm text-sm text-ink-2">{text}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

export function SettingsPanel() {
  const [provider, setProvider] = useState("auto");
  const [layout, setLayout] = useState("split");
  const [keys, setKeys] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const p = read(`${PREFIX}provider`);
    setProvider(p === "local" || p === "server" ? p : "auto");
    try {
      const l = JSON.parse(read(`${PREFIX}ui`) ?? "{}").layout;
      if (l === "plan" || l === "3d") setLayout(l);
    } catch {
      /* keep the default */
    }
    setKeys(ownKeys());
  }, []);

  const pickProvider = (v: string) => (setProvider(v), write(`${PREFIX}provider`, v));
  const pickLayout = (v: string) => {
    setLayout(v);
    let cur: Record<string, unknown> = {};
    try {
      cur = JSON.parse(read(`${PREFIX}ui`) ?? "{}");
    } catch {
      /* start fresh */
    }
    write(`${PREFIX}ui`, JSON.stringify({ ...cur, layout: v }));
  };

  const download = () => {
    const data = Object.fromEntries(ownKeys().map((k) => [k, read(k)]));
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `clavis-browser-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const clear = () => {
    for (const k of ownKeys()) {
      try {
        localStorage.removeItem(k);
      } catch {
        /* best effort */
      }
    }
    setKeys(ownKeys());
    setConfirm(false);
    setProvider("auto");
    setLayout("split");
    setDone("Everything Clavis kept in this browser has been removed.");
  };

  const radio = "flex cursor-pointer gap-3 border border-rule p-4 has-[:checked]:border-ink has-[:checked]:bg-paper-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-marker";

  return (
    <div className="border-x border-rule">
      <Row title="Assistant" text="Which assistant the studio asks. You can also switch it inside the studio.">
        <fieldset className="grid gap-2">
          <legend className="sr-only">Assistant</legend>
          {PROVIDERS.map((p) => (
            <label key={p.value} className={radio}>
              <input type="radio" name="provider" value={p.value} checked={provider === p.value} onChange={() => pickProvider(p.value)} className="mt-1 accent-ink" />
              <span>
                <span className="block font-semibold">{p.label}</span>
                <span className="block text-sm text-ink-2">{p.text}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </Row>

      <Row title="Studio layout" text="The view the studio opens in.">
        <fieldset className="grid grid-cols-3 gap-2">
          <legend className="sr-only">Studio layout</legend>
          {LAYOUTS.map((l) => (
            <label key={l.value} className={`${radio} items-center`}>
              <input type="radio" name="layout" value={l.value} checked={layout === l.value} onChange={() => pickLayout(l.value)} className="accent-ink" />
              <span className="text-sm font-semibold">{l.label}</span>
            </label>
          ))}
        </fieldset>
      </Row>

      <Row title="Your data" text="Projects and preferences are kept in this browser only. Download a copy, or remove all of it.">
        <p className="label text-ink-3">{keys.length} item{keys.length === 1 ? "" : "s"} stored</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={download} disabled={keys.length === 0} className="label flex items-center gap-2 border border-ink px-4 py-2.5 hover:bg-ink hover:text-paper disabled:opacity-40">
            <Download size={14} aria-hidden="true" /> Download everything
          </button>
          {confirm ? (
            <>
              <button type="button" onClick={clear} className="label flex items-center gap-2 bg-marker px-4 py-2.5 text-paper">
                <Trash2 size={14} aria-hidden="true" /> Yes, remove it all
              </button>
              <button type="button" onClick={() => setConfirm(false)} className="label border border-rule px-4 py-2.5">
                Keep it
              </button>
            </>
          ) : (
            <button type="button" onClick={() => (setConfirm(true), setDone(null))} disabled={keys.length === 0} className="label flex items-center gap-2 border border-rule px-4 py-2.5 hover:border-marker hover:text-marker disabled:opacity-40">
              <Trash2 size={14} aria-hidden="true" /> Remove all
            </button>
          )}
        </div>
        {confirm && <p className="mt-3 text-sm text-marker">This deletes every project in this browser. It cannot be undone; download a copy first if you want one.</p>}
        {done && (
          <p role="status" className="mt-3 text-sm text-ink-2">
            {done}
          </p>
        )}
      </Row>

      <Row title="Account" text="Email, password and connected sign-ins.">
        <div className="border border-dashed border-rule p-5 text-sm text-ink-2">
          {authConfigured() ? "Sign in to manage your account." : "Accounts are not switched on yet. Everything above works without one."}
        </div>
      </Row>
    </div>
  );
}
