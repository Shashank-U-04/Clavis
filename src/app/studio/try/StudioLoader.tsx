"use client";

import dynamic from "next/dynamic";

/** The studio needs the browser (storage, WebGL), so it is never rendered on the server. */
const StudioRoot = dynamic(() => import("@/studio/StudioRoot"), {
  ssr: false,
  loading: () => <div className="fixed inset-0 grid place-items-center bg-night font-mono text-sm text-[#7c8694]">Opening the studio…</div>,
});

export function StudioLoader() {
  return <StudioRoot />;
}
