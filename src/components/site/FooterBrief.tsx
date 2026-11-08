"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight } from "lucide-react";

/** A one-line brief at the foot of the page: the studio opens designing it. */
export function FooterBrief() {
  const router = useRouter();
  const [text, setText] = useState("");
  return (
    <form
      className="flex border-t border-rule"
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (t) router.push(`/studio/try?brief=${encodeURIComponent(t.slice(0, 300))}`);
      }}
    >
      <label htmlFor="footer-brief" className="sr-only">
        Describe a home
      </label>
      <input
        id="footer-brief"
        value={text}
        maxLength={300}
        onChange={(e) => setText(e.target.value)}
        placeholder="Two bedrooms, open kitchen, 70 m²"
        className="min-w-0 flex-1 bg-transparent px-5 py-4 text-sm outline-none placeholder:text-ink-3"
      />
      <button type="submit" aria-label="Design it in the studio" className="grid w-14 place-items-center border-l border-rule hover:bg-ink hover:text-paper">
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    </form>
  );
}
