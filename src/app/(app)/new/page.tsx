import type { Metadata } from "next";
import { Suspense } from "react";
import { NewPlanFlow } from "@/components/app/NewPlanFlow";
import { templateCards } from "@/components/app/templateData";
import { SheetHeader } from "@/components/app/ui";

export const metadata: Metadata = { title: "New plan", robots: { index: false } };

export default function NewPlanPage() {
  return (
    <>
      <SheetHeader sheet="C · New plan" title="Start a plan" intro="Choose how to begin. Whichever you pick, the plan is checked as it is made and saved as you work." />
      <Suspense fallback={<p className="p-8 text-ink-3">Loading…</p>}>
        <NewPlanFlow templates={templateCards()} />
      </Suspense>
    </>
  );
}
