import Link from "next/link";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { Logo } from "./Logo";
import { MobileMenu } from "./MobileMenu";
import { FEATURES, NAV } from "./nav";

/**
 * The site header drawn like the title block of a drawing sheet: a row of ruled cells, each
 * holding one destination, with the way into the studio in the marker colour.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
      <div className="mx-auto flex h-16 max-w-[1440px] items-stretch">
        <Link href="/" className="flex items-center border-r border-rule px-5 hover:text-marker" aria-label="Clavis home">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden flex-1 items-stretch lg:flex">
          {NAV.map((item) =>
            item.label === "Features" ? (
              <div key={item.href} className="group relative flex border-r border-rule">
                <Link href={item.href} className="label flex min-w-36 items-start justify-between gap-6 px-4 pt-3 text-ink-2 hover:text-ink">
                  {item.label}
                  <ChevronDown size={12} className="mt-0.5 transition-transform group-hover:rotate-180 group-focus-within:rotate-180" aria-hidden="true" />
                </Link>
                <div className="invisible absolute left-0 top-full w-[34rem] translate-y-1 border border-rule bg-paper opacity-0 shadow-[0_18px_40px_-24px_rgba(22,21,19,0.45)] transition-all duration-200 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                  <ul className="grid grid-cols-2">
                    {FEATURES.map((f, i) => (
                      <li key={f.href} className={`${i % 2 ? "" : "border-r"} ${i < 2 ? "border-b" : ""} border-rule`}>
                        <Link href={f.href} className="block p-4 hover:bg-paper-2">
                          <span className="label text-ink-3">0{i + 1}</span>
                          <span className="mt-2 block font-medium">{f.title}</span>
                          <span className="mt-1 block text-sm text-ink-2">{f.blurb}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <Link key={item.href} href={item.href} className="label flex min-w-36 items-start border-r border-rule px-4 pt-3 text-ink-2 hover:text-ink">
                {item.label}
              </Link>
            ),
          )}
          <span className="flex-1" />
          <Link href="/dashboard" className="label hidden min-w-32 items-start border-l border-rule px-4 pt-3 text-ink-2 hover:text-ink xl:flex">
            Projects
          </Link>
          <Link href="/login" className="label flex min-w-32 items-start border-l border-rule px-4 pt-3 text-ink-2 hover:text-ink">
            Sign in
          </Link>
          <Link href="/studio/try" className="label group flex min-w-44 flex-col justify-between border-l border-rule px-4 py-3 text-marker hover:bg-marker hover:text-paper">
            Open the studio
            <ArrowUpRight size={15} className="self-end transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </nav>

        <MobileMenu />
      </div>
    </header>
  );
}
