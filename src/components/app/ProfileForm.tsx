"use client";

/**
 * The profile: a name and a colour for the stamp that stands in for a photo, what you design
 * for, and your numbers. Until accounts are on it lives in this browser, like everything else.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check, LogIn, LogOut } from "lucide-react";
import { signOut, useAccount } from "@/lib/account/bridge";
import { authConfigured } from "@/lib/auth/config";
import { getProfile, listEvents, listPlans, listVersions, saveProfile, storageUsed } from "@/lib/workspace/browser";
import { mutate, useWorkspace } from "@/lib/workspace/useWorkspace";
import type { Profile } from "@/lib/workspace/types";
import { Avatar, Band, bytes } from "./ui";

const HUES = [228, 262, 300, 350, 25, 70, 150, 195];
const ROLES = ["My own home", "Clients", "Study or teaching", "Just exploring"];

const input = "w-full border border-rule bg-paper px-3 py-2.5 outline-none placeholder:text-ink-3 focus:border-ink";

export function ProfileForm() {
  const ws = useWorkspace((s) => {
    const plans = listPlans(s);
    return {
      profile: getProfile(s),
      plans: plans.length,
      rooms: plans.reduce((t, p) => t + p.rooms, 0),
      area: Math.round(plans.reduce((t, p) => t + p.area, 0)),
      versions: plans.reduce((t, p) => t + listVersions(s, p.id).filter((v) => !v.auto).length, 0),
      events: listEvents(s).length,
      starred: plans.filter((p) => p.starred).length,
      used: storageUsed(s as Storage | null),
    };
  });
  const [draft, setDraft] = useState<Profile | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (ws && !draft) setDraft(ws.profile);
  }, [ws, draft]);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  if (!ws || !draft) return <p className="p-8 text-ink-3">Loading…</p>;
  const dirty = JSON.stringify(draft) !== JSON.stringify(ws.profile);

  return (
    <>
      <form
        className="grid border-b border-rule lg:grid-cols-[minmax(0,1fr)_20rem]"
        onSubmit={(e) => {
          e.preventDefault();
          if (mutate((s) => saveProfile(s, draft))) {
            setDraft({ ...draft, name: draft.name.trim() });
            setSaved(true);
          }
        }}
      >
        <div className="grid gap-7 px-5 py-8 md:px-8 lg:border-r lg:border-rule">
          <div className="grid max-w-md gap-2">
            <label htmlFor="profile-name" className="label text-ink-3">
              Name
            </label>
            <input id="profile-name" value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="What Home should call you" className={input} autoComplete="name" />
          </div>

          <fieldset className="grid gap-3">
            <legend className="label mb-2 text-ink-3">Stamp colour</legend>
            <div className="flex flex-wrap gap-2">
              {HUES.map((h) => (
                <label key={h} className="cursor-pointer">
                  <input type="radio" name="hue" className="peer sr-only" checked={draft.hue === h} onChange={() => setDraft({ ...draft, hue: h })} />
                  <span className="grid h-9 w-9 place-items-center outline-offset-2 peer-checked:outline peer-checked:outline-2 peer-checked:outline-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-marker" style={{ background: `oklch(0.52 0.14 ${h})` }}>
                    {draft.hue === h && <Check size={15} className="text-white" aria-hidden="true" />}
                    <span className="sr-only">Colour {h}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="grid gap-3">
            <legend className="label mb-2 text-ink-3">You design for</legend>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <label key={r} className="cursor-pointer">
                  <input type="radio" name="role" className="peer sr-only" checked={draft.role === r} onChange={() => setDraft({ ...draft, role: r })} />
                  <span className="block border border-rule px-3 py-2 text-sm text-ink-2 hover:border-ink peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-marker">{r}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center gap-4">
            <button type="submit" disabled={!dirty} className="label bg-ink px-5 py-3 text-paper hover:bg-marker disabled:opacity-40">
              Save profile
            </button>
            {saved && (
              <span role="status" className="label flex items-center gap-2 text-marker">
                <Check size={14} aria-hidden="true" /> Saved
              </span>
            )}
          </div>
        </div>

        {/* the card, as others would see it once sharing exists */}
        <div className="grid-paper flex flex-col items-start gap-5 border-t border-rule p-5 md:p-8 lg:border-t-0">
          <p className="label text-ink-3">Preview</p>
          <div className="w-full border border-ink bg-paper p-5 shadow-[6px_6px_0_var(--color-rule)]">
            <div className="flex items-center gap-4">
              <Avatar name={draft.name} hue={draft.hue} size={56} />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{draft.name.trim() || "Guest"}</p>
                <p className="label mt-1 text-ink-3">{draft.role || "Designer"}</p>
              </div>
            </div>
            <p className="label mt-5 border-t border-dashed border-ink-3 pt-3 text-ink-3">Since {new Date(draft.since).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
          </div>
        </div>
      </form>

      <section aria-labelledby="numbers-heading" className="border-b border-rule">
        <Band title="Your numbers" id="numbers-heading" />
        <dl className="grid grid-cols-2 gap-px bg-rule md:grid-cols-4">
          {[
            ["Plans", ws.plans],
            ["Rooms laid out", ws.rooms],
            ["Floor area designed", `${ws.area} m²`],
            ["Saved versions", ws.versions],
            ["Starred", ws.starred],
            ["History events", ws.events],
            ["Storage used", bytes(ws.used)],
            ["Member since", new Date(ws.profile.since).toLocaleDateString()],
          ].map(([k, v]) => (
            <div key={String(k)} className="bg-paper px-5 py-5 md:px-8">
              <dt className="label text-ink-3">{k}</dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="account-heading" className="border-b border-rule">
        <Band title="Account" id="account-heading" />
        <AccountCard />
      </section>
    </>
  );
}

function AccountCard() {
  const { account, sync } = useAccount();
  if (account)
    return (
      <div className="flex flex-wrap items-center justify-between gap-5 px-5 py-8 md:px-8">
        <div className="max-w-xl">
          <p className="font-semibold">Signed in as {account.email}</p>
          <p className="mt-1 text-sm text-ink-2">
            Your plans, versions, history and this profile are kept in your account and synced to every device you sign in on. This browser keeps a working copy, so the studio
            stays fast and keeps working offline.
            {sync.state === "offline" ? " Some changes are waiting to be sent." : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/settings" className="label flex items-center gap-2 border border-rule px-4 py-3 hover:border-ink">
            Data and settings <ArrowRight size={13} aria-hidden="true" />
          </Link>
          <button type="button" onClick={() => void signOut()} className="label flex items-center gap-2 bg-ink px-4 py-3 text-paper hover:bg-marker">
            Sign out <LogOut size={13} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  return (
    <div className="flex flex-wrap items-center justify-between gap-5 px-5 py-8 md:px-8">
      <div className="max-w-xl">
        <p className="font-semibold">You are using Clavis as a guest.</p>
        <p className="mt-1 text-sm text-ink-2">
          {authConfigured()
            ? "Sign in to keep your plans in your account and open them anywhere. Everything in this browser comes with you."
            : "Accounts are not switched on yet. Everything — plans, versions, history and this profile — is kept in this browser only."}
        </p>
      </div>
      <div className="flex gap-2">
        <Link href="/settings" className="label flex items-center gap-2 border border-rule px-4 py-3 hover:border-ink">
          Data and settings <ArrowRight size={13} aria-hidden="true" />
        </Link>
        <Link href="/login" className="label flex items-center gap-2 bg-ink px-4 py-3 text-paper hover:bg-marker">
          Sign in <LogIn size={13} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
