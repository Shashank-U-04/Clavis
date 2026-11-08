import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { AppNav } from "@/components/app/AppNav";

/** The signed-in area: a slim ruled bar, then the page. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-rule bg-paper">
        <div className="mx-auto flex h-14 max-w-[1440px] items-stretch">
          <Link href="/" className="flex items-center border-r border-rule px-3 hover:text-marker sm:px-5" aria-label="Clavis home">
            <Logo />
          </Link>
          <AppNav />
          <span className="flex-1" />
          <Link href="/studio/try" className="label group flex items-center gap-2 border-l border-rule px-3 text-marker sm:gap-3 sm:px-5 hover:bg-marker hover:text-paper">
            Studio <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
          <Link href="/login" className="label hidden items-center border-l border-rule px-5 text-ink-2 hover:text-ink sm:flex">
            Sign in
          </Link>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}
