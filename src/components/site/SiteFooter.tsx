import Link from "next/link";
import { FEATURES } from "./nav";
import { FooterBrief } from "./FooterBrief";
import { HouseMark } from "./HouseMark";
import { Wordmark } from "./Wordmark";

const COLUMNS = [
  { title: "Product", links: [{ href: "/features", label: "Features" }, ...FEATURES.map((f) => ({ href: f.href, label: f.title }))] },
  { title: "Learn", links: [{ href: "/how-it-works", label: "How it works" }, { href: "/docs", label: "Docs" }, { href: "/docs#shortcuts", label: "Shortcuts" }] },
  { title: "Clavis", links: [{ href: "/", label: "Home" }, { href: "/about", label: "About" }, { href: "/dashboard", label: "Your plans" }, { href: "/templates", label: "Templates" }] },
];

const NOTES = [
  { title: "Your work", text: "Saved in this browser as you design. Accounts are on the way." },
  { title: "The assistant", text: "Clavis Local runs in your browser; a hosted model helps when one is set up." },
];

const ACCOUNT = [
  { href: "/login", label: "Sign in" },
  { href: "/signup", label: "Create an account" },
  { href: "/dashboard", label: "Your projects" },
];

const Cross = ({ className }: { className: string }) => (
  <span className={`pointer-events-none absolute text-sm leading-none text-ink-3 ${className}`} aria-hidden="true">
    +
  </span>
);

/** The foot of every page, ruled like the title block of a drawing sheet. */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-rule bg-paper">
      <div className="mx-auto max-w-[1440px] border-x border-rule">
        {/* index: statement, link columns and the mark */}
        <div className="grid grid-cols-2 lg:grid-cols-12">
          <div className="col-span-2 border-b border-rule p-5 lg:col-span-3 lg:border-r">
            <p className="text-[1.65rem] font-semibold uppercase leading-[0.95] tracking-[-0.035em]">
              Describe a home.
              <br />
              Walk through it.
            </p>
          </div>
          {COLUMNS.map((c, i) => (
            <div key={c.title} className={`border-b border-rule p-5 lg:col-span-2 lg:border-r ${i === 0 ? "border-r" : ""} ${i === 2 ? "col-span-2" : ""}`}>
              <p className="label text-ink-3">{c.title}</p>
              <ul className="mt-4 space-y-2 text-[0.95rem]">
                {c.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link href={l.href} className="hover:text-marker">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="col-span-1 hidden place-items-center border-b border-rule p-8 lg:col-span-3 lg:row-span-2 lg:grid">
            <HouseMark className="w-full max-w-[15rem] text-ink" />
          </div>

          {/* second row: start a design, notes, account */}
          <div className="col-span-2 flex flex-col justify-between border-b border-rule lg:col-span-3 lg:border-r">
            <div className="p-5">
              <p className="label text-ink-3">Start a design</p>
              <p className="mt-3 max-w-xs text-sm text-ink-2">Describe a home and the studio opens with it already being laid out.</p>
            </div>
            <FooterBrief />
          </div>
          {NOTES.map((n, i) => (
            <div key={n.title} className={`border-b border-rule p-5 lg:col-span-2 lg:border-r ${i === 0 ? "border-r" : ""}`}>
              <p className="label text-ink-3">{n.title}</p>
              <p className="mt-3 text-sm text-ink-2">{n.text}</p>
            </div>
          ))}
          <div className="col-span-2 border-b border-rule p-5 lg:col-span-2 lg:border-r">
            <p className="label text-ink-3">Account</p>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[0.95rem] lg:grid-cols-1">
              {ACCOUNT.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-marker">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* the wordmark, set out between rulers */}
        <div className="relative">
          <div className="ruler-x" aria-hidden="true" />
          <Cross className="left-1.5 top-1" />
          <Cross className="right-1.5 top-1" />
          <div className="px-5 py-8 md:px-16 md:py-12">
            <Wordmark />
          </div>
          <Cross className="bottom-1 left-1.5" />
          <Cross className="bottom-1 right-1.5" />
          <div className="ruler-x rotate-180" aria-hidden="true" />
        </div>

        {/* bottom bar */}
        <div className="flex flex-wrap items-stretch justify-between border-t border-rule">
          <p className="label flex items-center px-5 py-4 text-ink-3">
            © {year} Shashank U · Concept design, not construction documents
          </p>
          <div className="flex">
            {[
              { href: "/privacy", label: "Privacy" },
              { href: "/terms", label: "Terms" },
            ].map((l) => (
              <Link key={l.href} href={l.href} className="flex items-center border-l border-rule px-6 py-4 text-[0.95rem] hover:text-marker">
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
