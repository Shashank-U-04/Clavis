"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Whether an element has come into view yet, once. With reduced motion it reports "seen" at
 * once and `still`, so a figure can show its finished state without playing anything.
 */
export function useFirstSight(ref: RefObject<Element | null>, threshold = 0.3) {
  const [seen, setSeen] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStill(true);
      setSeen(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold]);

  return { seen, still };
}
