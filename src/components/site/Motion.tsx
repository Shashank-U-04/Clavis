"use client";

/**
 * Scroll motion for the site pages. Anything marked `data-reveal` waits, hidden, until it
 * scrolls into view, then eases in (globals.css says how: a fade and rise, words rising out of
 * a mask, lines typing out). The hiding only starts once this has run, so without JavaScript —
 * or with reduced motion — every page simply shows everything. What is already on screen when
 * a page opens is shown at once, so nothing flickers.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export function Motion() {
  const pathname = usePathname();
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // anything whose top has come up past the fold is shown — including what a fast scroll or
    // a jump to an anchor skipped over, so nothing above the reader is left hidden
    let waiting = [...document.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-in)")];
    const check = (fold: number) => {
      waiting = waiting.filter((el) => {
        if (el.getBoundingClientRect().top >= fold) return true;
        el.classList.add("is-in");
        return false;
      });
    };
    check(window.innerHeight); // on screen as the page opens: shown at once, so nothing flickers
    document.documentElement.classList.add("motion");
    let raf = 0;
    const onScroll = () => {
      raf ||= requestAnimationFrame(() => {
        raf = 0;
        check(window.innerHeight * 0.9);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [pathname]);
  return null;
}

/**
 * A number that counts up from zero the first time it scrolls into view. The page is served
 * with the real number, which stays if the number is already on screen, motion is reduced or
 * JavaScript is off.
 */
export function CountUp({ value, ms = 1400 }: { value: number; ms?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const el = ref.current;
    if (!el || value < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setShown(0);
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const step = (now: number) => {
          const p = Math.min(1, (now - t0) / ms);
          setShown(Math.round(value * (1 - (1 - p) ** 3)));
          if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, ms]);
  return (
    <span ref={ref} className="tabular-nums">
      {shown}
    </span>
  );
}
