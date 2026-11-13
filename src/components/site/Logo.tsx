/**
 * The Clavis mark: a room drawn in plan whose walls form the letter C, with a door standing
 * open in the gap. Clavis is Latin for key — the mark is the room and the way into it.
 *
 * Geometry on a 32-unit grid: walls 5 units thick on a 19-unit centreline square, a 10-unit
 * opening in the east wall, and the door's swing as a quarter circle of the same radius.
 */
export const MARK = {
  walls: "M25.5 11V6.5H6.5v19h19V21",
  door: "M25.5 21h-10a10 10 0 0 1 10-10z",
} as const;

export function LogoMark({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d={MARK.walls} fill="none" stroke="currentColor" strokeWidth="5" />
      <path d={MARK.door} fill="var(--color-marker)" />
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
