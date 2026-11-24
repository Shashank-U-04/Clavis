import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { PlansBrowser } from "@/components/app/PlansBrowser";
import { SheetHeader } from "@/components/app/ui";

export const metadata: Metadata = { title: "Plans", robots: { index: false } };

export default function PlansPage() {
  return (
    <>
      <SheetHeader title="Every plan" intro="Search, sort and star your plans; open one in the studio, or look at its versions and history.">
        <Link href="/new" className="label flex items-center gap-3 bg-ink px-4 py-3 text-paper hover:bg-marker">
          New plan <Plus size={14} aria-hidden="true" />
        </Link>
      </SheetHeader>
      <Suspense fallback={<p className="p-8 text-ink-3">Loading…</p>}>
        <PlansBrowser />
      </Suspense>
    </>
  );
}
