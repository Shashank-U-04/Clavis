import type { Metadata } from "next";
import { ProjectGrid } from "@/components/app/ProjectGrid";
import { authConfigured } from "@/lib/auth/config";

export const metadata: Metadata = { title: "Projects", robots: { index: false } };

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-[1440px] border-x border-rule">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule px-5 py-8 md:px-8">
        <div>
          <p className="label text-ink-3">Sheet A · Projects</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em]">Your homes</h1>
        </div>
      </div>
      {!authConfigured() && (
        <p className="border-b border-rule bg-paper-2 px-5 py-3 text-sm text-ink-2 md:px-8">
          Accounts are not switched on yet, so these are the projects saved in this browser. Nothing here leaves it.
        </p>
      )}
      <ProjectGrid />
    </div>
  );
}
