"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAccount } from "@/lib/account/bridge";
import { BROUGHT_ALONG_KEY } from "@/lib/account/guestImport";

const forget = () => {
  try {
    sessionStorage.removeItem(BROUGHT_ALONG_KEY);
  } catch {
    /* nothing to forget */
  }
};

/** After signing in: the plans made before it are in the account now, said once. */
export function GuestImportBanner() {
  const { account } = useAccount();
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!account) return;
    let v = 0;
    try {
      v = Number(sessionStorage.getItem(BROUGHT_ALONG_KEY) ?? 0);
    } catch {
      /* nothing to say */
    }
    if (!(v > 0)) return;
    setN(v);
    // said once: forget it after it has been on screen a moment (not at once, since the page
    // that moved the plans reloads straight away and must not use it up)
    const t = setTimeout(forget, 3000);
    return () => clearTimeout(t);
  }, [account]);

  if (!account || n === 0) return null;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-rule bg-paper-2 px-5 py-4 text-sm md:px-8" role="status">
      <p>
        <span className="font-semibold">{n === 1 ? "The plan" : `The ${n} plans`} you made before signing in {n === 1 ? "is" : "are"} in your account now</span>
        <span className="text-ink-2"> and on every device you sign in on.</span>
      </p>
      <button type="button" onClick={() => (forget(), setN(0))} className="text-ink-3 hover:text-ink" aria-label="Dismiss">
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
