"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight } from "lucide-react";

const IDEAS = ["A two-bedroom flat with an open kitchen, 70 m²", "Three bedrooms, two bathrooms and a study", "A studio apartment, 40 m²"];

/** Type a home; the studio opens with that brief already being designed. */
export function BriefBox({ dark = false }: { dark?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const go = (brief: string) => {
    const t = brief.trim();
    if (t) router.push(`/studio/try?brief=${encodeURIComponent(t.slice(0, 300))}`);
  };
  const ink = dark ? "border-paper/30 text-paper placeholder:text-paper/45" : "border-ink text-ink placeholder:text-ink-3";
  return (
    <div>
      <form
        className={`flex border ${ink}`}
        onSubmit={(e) => {
          e.preventDefault();
          go(text);
        }}
      >
        <label htmlFor="brief" className="sr-only">
          Describe a home
        </label>
        <input
          id="brief"
          value={text}
          maxLength={300}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe a home — e.g. three bedrooms and a study, 110 m²"
          className="min-w-0 flex-1 bg-transparent px-4 py-4 text-base outline-none"
        />
        <button type="submit" className={`label flex items-center gap-3 px-5 ${dark ? "bg-paper text-ink hover:bg-marker hover:text-paper" : "bg-ink text-paper hover:bg-marker"}`}>
          Design it <ArrowRight size={14} aria-hidden="true" />
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {IDEAS.map((i) => (
          <button key={i} type="button" onClick={() => go(i)} className={`label border px-2.5 py-1.5 text-[0.66rem] ${dark ? "border-paper/25 text-paper/70 hover:border-paper hover:text-paper" : "border-rule text-ink-2 hover:border-ink hover:text-ink"}`}>
            {i}
          </button>
        ))}
      </div>
    </div>
  );
}
