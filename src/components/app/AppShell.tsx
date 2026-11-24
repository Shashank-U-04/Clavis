"use client";

/**
 * The app's frame: a ruled sidebar (New plan; Home, Plans, Templates, History; Profile,
 * Settings; where your work is kept) and a top bar with the sheet title, a plan search and
 * the way back into the studio. Below `lg` the sidebar becomes a drawer.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, HardDrive, Menu, Plug, Search, X } from "lucide-react";
import { AccountStatus, useWhereSaved } from "@/components/account/AccountStatus";
import { Logo } from "@/components/site/Logo";
import { McpButton } from "@/components/mcp/McpButton";
import { ThemeToggle } from "@/components/site/ThemeToggle";
import { getProfile, lastPlan, listPlans, storageUsed } from "@/lib/workspace/browser";
import { useWorkspace } from "@/lib/workspace/useWorkspace";
import { NEW_PLAN, WORK, YOU, isActive, sheetFor, type AppDest } from "./destinations";
import { Avatar, STORAGE_BUDGET, bytes } from "./ui";

function NavItem({ d, path, count, lead }: { d: AppDest; path: string; count?: number; lead?: ReactNode }) {
  const on = isActive(path, d.href);
  return (
    <li>
      <Link
        href={d.href}
        aria-current={on ? "page" : undefined}
        className={`group flex items-center gap-3 border-b border-rule px-5 py-3 text-[0.95rem] transition-colors ${on ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2 hover:text-ink"}`}
      >
        {lead ?? <d.icon size={16} strokeWidth={1.6} aria-hidden="true" className={on ? "" : "text-ink-3 group-hover:text-ink"} />}
        <span className="flex-1">{d.label}</span>
        {count !== undefined && count > 0 && <span className={`font-mono text-[0.68rem] tabular-nums ${on ? "text-paper/70" : "text-ink-3"}`}>{count}</span>}
        <span className={`label text-[0.6rem] ${on ? "text-paper/50" : "text-ink-3/70"}`}>{d.sheet}</span>
      </Link>
    </li>
  );
}

function Sidebar({ path }: { path: string }) {
  const ws = useWorkspace((s) => ({ plans: listPlans(s).length, profile: getProfile(s), used: storageUsed(s as Storage | null) }));
  const used = ws?.used ?? 0;
  const where = useWhereSaved();
  return (
    <div className="flex h-full flex-col">
      <Link href="/" className="flex h-14 shrink-0 items-center border-b border-rule px-5 hover:text-marker" aria-label="Clavis website">
        <Logo />
      </Link>

      <div className="border-b border-rule p-3">
        <Link href={NEW_PLAN.href} className={`label flex items-center justify-between gap-3 px-4 py-3 transition-colors ${isActive(path, NEW_PLAN.href) ? "bg-marker text-paper" : "bg-ink text-paper hover:bg-marker"}`}>
          <span>New plan</span>
          <NEW_PLAN.icon size={15} strokeWidth={1.8} aria-hidden="true" />
        </Link>
      </div>

      <nav aria-label="App" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <p className="label px-5 pb-2 pt-5 text-[0.62rem] text-ink-3">Work</p>
        <ul className="border-t border-rule">
          {WORK.map((d) => (
            <NavItem key={d.href} d={d} path={path} count={d.href === "/plans" ? ws?.plans : undefined} />
          ))}
        </ul>
        <p className="label px-5 pb-2 pt-6 text-[0.62rem] text-ink-3">You</p>
        <ul className="border-t border-rule">
          {YOU.map((d) => (
            <NavItem key={d.href} d={d} path={path} lead={d.href === "/profile" && ws ? <Avatar name={ws.profile.name} hue={ws.profile.hue} size={18} /> : undefined} />
          ))}
        </ul>
      </nav>

      <div className="border-t border-rule px-5 py-4">
        <p className="label flex items-center gap-2 text-[0.62rem] text-ink-3">
          <HardDrive size={12} aria-hidden="true" /> {where}
        </p>
        <div className="mt-2.5 h-1 bg-paper-3" role="meter" aria-label="Browser storage used" aria-valuemin={0} aria-valuemax={STORAGE_BUDGET} aria-valuenow={used}>
          <div className="h-full bg-ink" style={{ width: `${Math.min(100, Math.max(used > 0 ? 2 : 0, (used / STORAGE_BUDGET) * 100))}%` }} />
        </div>
        <p className="mt-1.5 font-mono text-[0.66rem] text-ink-3">{bytes(used)} of about 5 MB</p>
        <AccountStatus />
      </div>
    </div>
  );
}

function PlanSearch({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className={`flex items-center gap-2 border border-rule bg-paper px-3 py-1.5 focus-within:border-ink ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `/plans?q=${encodeURIComponent(q.trim())}` : "/plans");
      }}
    >
      <Search size={14} className="text-ink-3" aria-hidden="true" />
      <label htmlFor="plan-search" className="sr-only">
        Search plans
      </label>
      <input id="plan-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search plans" className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-ink-3" />
    </form>
  );
}

function TopBar({ path, onMenu }: { path: string; onMenu: () => void }) {
  const last = useWorkspace((s) => lastPlan(s));
  const { sheet, label } = sheetFor(path);
  const continueHref = last ? `/studio/try?project=${encodeURIComponent(last.id)}` : "/new";
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-stretch border-b border-rule bg-paper">
      <button type="button" onClick={onMenu} className="flex w-14 items-center justify-center border-r border-rule lg:hidden" aria-label="Open the menu">
        <Menu size={19} strokeWidth={1.5} />
      </button>
      <p className="flex min-w-0 items-center gap-3 px-5 md:px-8">
        <span className="label text-ink-3">{sheet}</span>
        <span className="truncate font-medium">{label}</span>
      </p>
      <span className="flex-1" />
      <div className="hidden items-center border-l border-rule px-4 md:flex">
        <PlanSearch className="w-64" />
      </div>
      <McpButton className="label flex items-center gap-2 border-l border-rule px-3 text-ink-2 hover:bg-paper-2 hover:text-ink sm:px-4">
        <Plug size={15} strokeWidth={1.6} aria-hidden="true" />
        <span>MCP</span>
      </McpButton>
      <ThemeToggle className="flex w-12 items-center justify-center border-l border-rule text-ink-2 hover:text-ink" />
      <Link href={continueHref} className="label group flex items-center gap-3 border-l border-rule px-4 text-marker hover:bg-marker hover:text-paper sm:px-5" title={last ? `Continue “${last.name}”` : "Start a plan"}>
        <span className="hidden sm:inline">{last ? "Continue in studio" : "Open the studio"}</span>
        <span className="sm:hidden">Studio</span>
        <ArrowUpRight size={14} aria-hidden="true" />
      </Link>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [path]);
  useEffect(() => {
    if (!drawer) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [drawer]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh border-r border-rule bg-paper lg:block">
        <Sidebar path={path} />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-ink/30" aria-label="Close the menu" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-[min(19rem,86vw)] border-r border-rule bg-paper shadow-2xl">
            <button type="button" onClick={() => setDrawer(false)} className="absolute right-0 top-0 z-10 flex h-14 w-14 items-center justify-center border-l border-rule" aria-label="Close the menu">
              <X size={19} strokeWidth={1.5} />
            </button>
            <Sidebar path={path} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <TopBar path={path} onMenu={() => setDrawer(true)} />
        <div className="border-b border-rule p-3 md:hidden">
          <PlanSearch />
        </div>
        <main id="main" className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
