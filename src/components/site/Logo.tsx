/** The mark alone: a house drawn as a keyhole — clavis is Latin for key. */
export function LogoMark({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" className={className} aria-hidden="true">
      <path d="M3 12 13 3.5 23 12v11H3z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="13" cy="13.2" r="2.6" fill="var(--color-marker)" />
      <path d="M11.9 15.2h2.2l.8 4.8h-3.8z" fill="var(--color-marker)" />
    </svg>
  );
}

/** The Clavis mark and name. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark />
      <span className="text-[1.05rem] font-semibold tracking-[-0.02em]">Clavis</span>
    </span>
  );
}
