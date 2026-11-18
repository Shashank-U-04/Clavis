"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { useAccount, syncNow } from "@/lib/account/bridge";
import { declineGuestPlans, guestPlansToOffer, importGuestPlans } from "@/lib/account/guestImport";
import { baseStorage, browserStorage } from "@/model/persistence";
import { notifyWorkspace } from "@/lib/workspace/useWorkspace";

/** On the first visit after signing in: bring along the plans made here as a guest? */
export function GuestImportBanner() {
  const { account } = useAccount();
  const [names, setNames] = useState<string[]>([]);
  const [done, setDone] = useState<number | null>(null);

  useEffect(() => {
    if (!account) return setNames([]);
    setNames(guestPlansToOffer(baseStorage(), browserStorage()).map((p) => p.name));
  }, [account]);

  if (done !== null)
    return (
      <div className="border-b border-rule bg-paper-2 px-5 py-4 text-sm md:px-8" role="status">
        {done === 1 ? "1 plan is" : `${done} plans are`} now in your account.
      </div>
    );
  if (!account || names.length === 0) return null;

  const bring = () => {
    const guest = baseStorage();
    const mine = browserStorage();
    if (!guest || !mine) return;
    setDone(importGuestPlans(guest, mine));
    setNames([]);
    notifyWorkspace();
    void syncNow();
  };
  const decline = () => {
    declineGuestPlans(browserStorage());
    setNames([]);
  };

  return (
    <section className="flex flex-wrap items-center justify-between gap-4 border-b border-rule bg-paper-2 px-5 py-5 md:px-8" aria-label="Plans from before you signed in">
      <div className="max-w-2xl">
        <p className="font-semibold">
          {names.length === 1 ? "1 plan" : `${names.length} plans`} made in this browser before you signed in
        </p>
        <p className="mt-1 text-sm text-ink-2">
          {names.slice(0, 3).join(", ")}
          {names.length > 3 ? ` and ${names.length - 3} more` : ""}. Bring {names.length === 1 ? "it" : "them"} into your account to open {names.length === 1 ? "it" : "them"} anywhere. The
          copies here stay as they are.
        </p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={decline} className="label flex items-center gap-2 border border-rule px-4 py-3 hover:border-ink">
          Not now <X size={13} aria-hidden="true" />
        </button>
        <button type="button" onClick={bring} className="label flex items-center gap-2 bg-ink px-4 py-3 text-paper hover:bg-marker">
          Bring {names.length === 1 ? "it" : "them"} along <Download size={13} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
