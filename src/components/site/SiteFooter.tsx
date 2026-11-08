import Link from "next/link";
import { Logo } from "./Logo";
import { FOOTER } from "./nav";

/** The footer as the bottom strip of a drawing sheet: columns, a title block and a scale bar. */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-rule bg-paper">
      <div className="mx-auto grid max-w-[1440px] grid-cols-2 md:grid-cols-6">
        <div className="col-span-2 flex flex-col justify-between gap-10 border-b border-rule p-6 md:border-b-0 md:border-r">
          <Logo />
          <p className="max-w-xs text-sm text-ink-2">Describe a home. Clavis lays it out in metres, checks it, and lets you walk through it.</p>
        </div>
        {FOOTER.map((col, i) => (
          <div key={col.title} className={`border-rule p-6 ${i % 2 === 0 ? "border-r" : ""} md:border-r ${i < 2 ? "border-b md:border-b-0" : ""}`}>
            <p className="label text-ink-3">{col.title}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {col.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link href={l.href} className="text-ink-2 hover:text-marker">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-rule">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-6 py-4">
          <p className="label text-ink-3">© {year} Clavis · Concept design, not construction documents</p>
          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="label text-ink-3">0</span>
            <span className="flex h-2 w-40 border border-ink">
              <span className="w-1/4 bg-ink" />
              <span className="w-1/4" />
              <span className="w-1/4 bg-ink" />
              <span className="w-1/4" />
            </span>
            <span className="label text-ink-3">4 m</span>
          </div>
        </div>
      </div>
      <div className="overflow-hidden border-t border-rule" aria-hidden="true">
        <p className="mx-auto max-w-[1440px] translate-y-[18%] select-none px-4 text-[clamp(5rem,19vw,17rem)] font-semibold leading-none tracking-[-0.06em] text-paper-3">Clavis</p>
      </div>
    </footer>
  );
}
