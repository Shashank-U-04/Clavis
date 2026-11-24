"use client";

/**
 * Preferences that live in this browser: which assistant the studio uses, the views and theme
 * it opens with, and the data itself (download it all, or clear it). The account section waits
 * for accounts to be switched on.
 */

import { useEffect, useState } from "react";
import { Plug, Trash2 } from "lucide-react";
import { McpButton } from "@/components/mcp/McpButton";
import { MCP_TOOLS } from "@/components/mcp/McpPanel";
import { ReportDownload } from "./ReportDownload";
import { authConfigured } from "@/lib/auth/config";
import { ALL_VIEWS, countViews, readTheme, readViews, toggleView, type ThemePref, type ViewKey, type Views } from "@/studio/views";
import { applyTheme } from "@/lib/theme";

const PREFIX = "clavis:";
const PROVIDERS = [
  { value: "auto", label: "Auto", text: "Clavis Local first; the hosted model when a brief needs it." },
  { value: "local", label: "Clavis Local", text: "Rule-based, runs in your browser, nothing leaves it." },
  { value: "server", label: "Hosted model", text: "Every request goes to the hosted model when it is configured." },
] as const;
const VIEW_OPTIONS: { key: ViewKey; label: string }[] = [
  { key: "plan", label: "2D plan" },
  { key: "scene", label: "3D model" },
  { key: "side", label: "Chat" },
];
const THEMES: { value: ThemePref; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Match this device" },
];

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
  const [views, setViews] = useState<Views>(ALL_VIEWS);
  const [theme, setTheme] = useState<ThemePref>("light");
  const [keys, setKeys] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const p = read(`${PREFIX}provider`);
    setProvider(p === "local" || p === "server" ? p : "auto");
    try {
      const u = JSON.parse(read(`${PREFIX}ui`) ?? "{}");
      setViews(readViews(u.views, u.layout) ?? ALL_VIEWS);
      setTheme(readTheme(u.theme) ?? "light");
    } catch {
      /* keep the defaults */
    }
    setKeys(ownKeys());
  }, []);

  const pickProvider = (v: string) => (setProvider(v), write(`${PREFIX}provider`, v));
  /** Merge one preference into what the studio saved, leaving the rest as it was. */
  const saveUi = (patch: Record<string, unknown>) => {
    let cur: Record<string, unknown> = {};
    try {
      cur = JSON.parse(read(`${PREFIX}ui`) ?? "{}");
    } catch {
      /* start fresh */
    }
    delete cur.layout;
    write(`${PREFIX}ui`, JSON.stringify({ ...cur, ...patch }));
  };
  const flipView = (k: ViewKey) => {
    const next = toggleView(views, k);
    setViews(next);
    saveUi({ views: next });
  };
  const pickTheme = (t: ThemePref) => (setTheme(t), saveUi({ theme: t }), applyTheme(t));

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
    setViews(ALL_VIEWS);
    setTheme("light");
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

      <Row title="Studio views" text="What the studio shows when it opens. You can also switch inside it, with the buttons in its bar or the keys 1 to 4; Walk starts from the 3D model.">
        <fieldset className="grid grid-cols-3 gap-2">
          <legend className="sr-only">Studio views</legend>
          {VIEW_OPTIONS.map((v) => (
            <label key={v.key} className={`${radio} items-center`}>
              <input type="checkbox" checked={views[v.key]} disabled={views[v.key] && countViews(views) === 1} onChange={() => flipView(v.key)} className="accent-ink" />
              <span className="text-sm font-semibold">{v.label}</span>
            </label>
          ))}
        </fieldset>
        <p className="mt-3 text-sm text-ink-3">At least one view stays on.</p>
      </Row>

      <Row title="Theme" text="Light like paper, dark for evenings, or follow your device. It applies to the whole site and the studio.">
        <fieldset className="grid grid-cols-3 gap-2">
          <legend className="sr-only">Theme</legend>
          {THEMES.map((t) => (
            <label key={t.value} className={`${radio} items-center`}>
              <input type="radio" name="theme" value={t.value} checked={theme === t.value} onChange={() => pickTheme(t.value)} className="accent-ink" />
              <span className="text-sm font-semibold">{t.label}</span>
            </label>
          ))}
        </fieldset>
      </Row>

      <Row title="Design report" text="A PDF of one of your designs: its floor plans to scale, the house in 3D from five angles, and every room, door, window and piece of furniture with its name and size.">
        <ReportDownload />
      </Row>

      <Row title="MCP: AI agents" text="Connect an AI agent you use to your plans through MCP. It can list, read, check, create and edit plans with the studio’s own checked operations; you choose read only or read and edit, and can revoke access at any time.">
        <div id="mcp" className="grid gap-4">
          <McpButton className="label flex items-center gap-2 justify-self-start bg-ink px-4 py-2.5 text-paper hover:bg-marker">
            <Plug size={14} aria-hidden="true" /> Set up MCP
          </McpButton>
          <p className="text-sm text-ink-3">{MCP_TOOLS.length} tools: {MCP_TOOLS.map(([k]) => k).join(", ")}.</p>
        </div>
      </Row>

      <Row title="This browser's copy" text="Your projects are kept in your account; this browser keeps a working copy, with your preferences. Remove the copy here to start this browser afresh.">
        <p className="label text-ink-3">{keys.length} item{keys.length === 1 ? "" : "s"} stored</p>
        <div className="mt-4 flex flex-wrap gap-2">
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
        {confirm && <p className="mt-3 text-sm text-marker">This removes this browser’s copy of your projects and your preferences. Your projects stay in your account and come back here the next time Clavis syncs.</p>}
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
