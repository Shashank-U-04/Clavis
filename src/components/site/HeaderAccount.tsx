"use client";

/**
 * The header's account cell: "Sign in" for a visitor, "Your projects" once signed in. It reads
 * the session already in this browser (no network call), so the site's pages stay static.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export function HeaderAccount({ className }: { className: string }) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb) return;
    void sb.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = sb.auth.onAuthStateChange((_event, session) => setSignedIn(!!session));
    return () => data.subscription.unsubscribe();
  }, []);
  return signedIn ? (
    <Link href="/dashboard" className={className}>
      Your projects
    </Link>
  ) : (
    <Link href="/login" className={className}>
      Sign in
    </Link>
  );
}
