"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { FEATURES, NAV } from "./nav";

/** The header's menu on small screens: a full-width sheet under the bar. */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="ml-auto flex lg:hidden">
      <Link href="/studio/try" className="label flex items-center border-l border-rule px-4 text-marker">
        Studio
      </Link>
      <button
        type="button"
        className="flex w-16 items-center justify-center border-l border-rule"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
      </button>
      {open && (
        <div id="mobile-menu" className="fixed inset-x-0 bottom-0 top-16 overflow-y-auto border-t border-rule bg-paper">
          <nav aria-label="Mobile" className="flex flex-col">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="border-b border-rule px-5 py-5 text-2xl font-medium tracking-tight">
                {n.label}
              </Link>
            ))}
            <div className="grid grid-cols-2 border-b border-rule">
              {FEATURES.map((f, i) => (
                <Link key={f.href} href={f.href} className={`p-5 ${i % 2 ? "" : "border-r"} ${i < 2 ? "border-b" : ""} border-rule`}>
                  <span className="label text-ink-3">0{i + 1}</span>
                  <span className="mt-1 block text-sm font-medium">{f.title}</span>
                </Link>
              ))}
            </div>
            <Link href="/login" className="border-b border-rule px-5 py-5 text-lg">
              Sign in
            </Link>
            <Link href="/studio/try" className="label bg-ink px-5 py-6 text-paper">
              Open the studio →
            </Link>
          </nav>
        </div>
      )}
    </div>
  );
}
