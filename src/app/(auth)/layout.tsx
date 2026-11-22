import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { Frame } from "@/components/site/Sheet";

const POINTS = ["Your plans on every device, synced as you work", "Named versions to return to", "A history of everything you did", "25 hosted-AI requests a day on your account"];

/** Sign-in pages: a dark title sheet on the left, the form on paper on the right. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="stay-dark relative hidden flex-col justify-between overflow-hidden bg-ink p-10 text-paper lg:flex">
        <Link href="/" className="w-fit hover:text-marker" aria-label="Clavis home">
          <Logo />
        </Link>
        <div>
          <p className="label text-paper/50">Your account</p>
          <h2 className="mt-4 max-w-md text-5xl font-semibold uppercase leading-[0.95] tracking-[-0.035em]">Your homes, wherever you are.</h2>
          <ul className="mt-10 max-w-md divide-y divide-paper/15 border-y border-paper/15">
            {POINTS.map((p) => (
              <li key={p} className="flex items-center gap-3 py-3 text-paper/80">
                <span className="h-1.5 w-1.5 bg-marker" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="label text-paper/40">Free · no new password · private to you</p>
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full border border-paper/10" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-8 -top-8 h-64 w-64 rounded-full border border-paper/10" aria-hidden="true" />
      </aside>
      <main className="flex flex-col">
        <div className="flex h-16 items-stretch border-b border-rule">
          <Link href="/" className="label flex items-center gap-2 border-r border-rule px-5 text-ink-2 hover:text-ink">
            <ArrowLeft size={14} aria-hidden="true" /> Back to Clavis
          </Link>
          <Link href="/" className="flex items-center px-5 lg:hidden" aria-label="Clavis home">
            <Logo />
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center p-5 md:p-12">
          <Frame className="w-full max-w-md p-6 md:p-10" rulers={false}>
            {children}
          </Frame>
        </div>
      </main>
    </div>
  );
}
