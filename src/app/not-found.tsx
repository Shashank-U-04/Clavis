import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/site/Logo";

export const metadata: Metadata = { title: "Not found" };

/**
 * A page that is not there: drawn as a room with no way in — four walls and the dashed outline
 * of a door that was never built.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center border-b border-rule px-5 md:px-8">
        <Link href="/" className="hover:text-marker" aria-label="Clavis home">
          <Logo />
        </Link>
      </header>
      <main id="main" className="grid flex-1 place-items-center px-5 py-16">
        <div className="grid w-full max-w-3xl items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <svg viewBox="0 0 200 200" className="mx-auto w-full max-w-[16rem] text-ink" role="img" aria-label="A room drawn in plan with no door">
            <defs>
              <pattern id="nf-grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M10 0H0V10" fill="none" stroke="var(--color-rule)" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="200" height="200" fill="url(#nf-grid)" />
            <path d="M40 40H160V160H40Z" fill="none" stroke="currentColor" strokeWidth="9" />
            <path d="M160 85V125M160 125A40 40 0 0 1 120 85" fill="none" stroke="var(--color-marker)" strokeWidth="2" strokeDasharray="5 4" />
            <text x="100" y="106" textAnchor="middle" className="fill-ink-3 font-mono" fontSize="13" letterSpacing="2">
              NO DOOR
            </text>
            <path d="M40 182H160" stroke="var(--color-marker)" strokeWidth="1" />
            <path d="M40 178V186M160 178V186" stroke="var(--color-marker)" strokeWidth="1" />
            <text x="100" y="196" textAnchor="middle" className="fill-marker font-mono" fontSize="9">
              404
            </text>
          </svg>
          <div>
            <p className="label text-marker">Error 404</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">This page isn’t on the plan.</h1>
            <p className="mt-4 max-w-md text-ink-2">The link may be old, or the address mistyped. A plan you are looking for may have been deleted or belong to another account.</p>
            <div className="mt-8 flex flex-wrap gap-2">
              <Link href="/" className="label bg-ink px-4 py-3 text-paper hover:bg-marker">
                Clavis home
              </Link>
              <Link href="/dashboard" className="label border border-rule px-4 py-3 hover:border-ink">
                Your plans
              </Link>
              <Link href="/docs" className="label border border-rule px-4 py-3 hover:border-ink">
                Docs
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
