"use client";

/**
 * Something broke while a page was showing. Your work is safe: plans are saved in this browser
 * as you go and synced to your account, so trying again or going back loses nothing.
 */

import Link from "next/link";
import { useEffect } from "react";
import { Logo } from "@/components/site/Logo";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center border-b border-rule px-5 md:px-8">
        <Link href="/" className="hover:text-marker" aria-label="Clavis home">
          <Logo />
        </Link>
      </header>
      <main id="main" className="grid flex-1 place-items-center px-5 py-16">
        <div className="max-w-xl" role="alert">
          <p className="label text-marker">Something went wrong</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">This page stopped drawing.</h1>
          <p className="mt-4 text-ink-2">Your plans are safe: they are saved as you go and kept in your account. Try again, and if it keeps happening, reload the page.</p>
          {digest && <p className="mt-3 font-mono text-xs text-ink-3">Reference {digest}</p>}
          <div className="mt-8 flex flex-wrap gap-2">
            <button type="button" onClick={() => retry()} className="label bg-ink px-4 py-3 text-paper hover:bg-marker">
              Try again
            </button>
            <Link href="/dashboard" className="label border border-rule px-4 py-3 hover:border-ink">
              Your plans
            </Link>
            <Link href="/" className="label border border-rule px-4 py-3 hover:border-ink">
              Clavis home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
