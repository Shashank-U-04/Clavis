import type { Metadata } from "next";
import { PlanDetail } from "@/components/app/PlanDetail";

export const metadata: Metadata = { title: "Plan", robots: { index: false } };

/** One plan. Plans live in the browser for now, so the page reads it there. */
export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlanDetail id={decodeURIComponent(id)} />;
}
