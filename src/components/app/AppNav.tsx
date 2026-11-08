"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "Projects" },
  { href: "/settings", label: "Settings" },
];

export function AppNav() {
  const path = usePathname();
  return (
    <nav aria-label="App" className="flex items-stretch">
      {ITEMS.map((i) => {
        const on = path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined} className={`label flex items-center border-r border-rule px-5 ${on ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
