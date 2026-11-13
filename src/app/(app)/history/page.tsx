import type { Metadata } from "next";
import { HistoryTimeline } from "@/components/app/HistoryTimeline";
import { SheetHeader } from "@/components/app/ui";

export const metadata: Metadata = { title: "History", robots: { index: false } };

export default function HistoryPage() {
  return (
    <>
      <SheetHeader sheet="E · History" title="What you did" intro="Every new plan, edit session, saved version, rename and download, across all your plans." />
      <HistoryTimeline />
    </>
  );
}
