import type { Metadata } from "next";
import { SettingsPanel } from "@/components/app/SettingsPanel";
import { SheetHeader } from "@/components/app/ui";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default function SettingsPage() {
  return (
    <>
      <SheetHeader sheet="G · Settings" title="Settings" intro="The assistant, how the studio opens, and the data kept in this browser." />
      <SettingsPanel />
    </>
  );
}
