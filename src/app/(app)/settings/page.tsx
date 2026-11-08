import type { Metadata } from "next";
import { SettingsPanel } from "@/components/app/SettingsPanel";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="border-x border-b border-rule px-5 py-8 md:px-8">
        <p className="label text-ink-3">Sheet B · Settings</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em]">Settings</h1>
      </div>
      <SettingsPanel />
    </div>
  );
}
