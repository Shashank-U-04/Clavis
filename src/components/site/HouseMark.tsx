/**
 * The Clavis mark set out as a drawing: the walls and the door at full size, with the
 * construction lines a draughtsman would leave — wall faces run past their corners, the
 * door's swing is completed as a dashed circle, and the opening is dimensioned.
 */

import { MARK } from "./Logo";

const K = 3; // the 32-unit mark, three times up
const O = 16; // where it sits on the sheet

export function HouseMark({ className = "" }: { className?: string }) {
  const at = (v: number) => O + v * K;
  const faces = [4, 9, 23, 28];
  return (
    <svg viewBox="0 0 128 128" className={className} aria-hidden="true">
      <g stroke="var(--color-ink-3)" strokeWidth={0.5} fill="none">
        {faces.map((f) => (
          <g key={f}>
            <path d={`M${at(f)} 6V122`} />
            <path d={`M6 ${at(f)}H122`} />
          </g>
        ))}
        <circle cx={at(25.5)} cy={at(21)} r={10 * K} strokeDasharray="2 2.5" />
      </g>
      <g transform={`translate(${O} ${O}) scale(${K})`}>
        <path d={MARK.walls} fill="none" stroke="currentColor" strokeWidth={5} />
        <path d={MARK.door} fill="var(--color-marker)" />
      </g>
      {/* the opening, dimensioned on the east side */}
      <g stroke="var(--color-marker)" strokeWidth={0.7} fill="none">
        <path d={`M${at(31.2)} ${at(11)}V${at(21)}`} />
        <path d={`M${at(30.4)} ${at(11.8)}l${1.6 * K} ${-1.6 * K}M${at(30.4)} ${at(21.8)}l${1.6 * K} ${-1.6 * K}`} />
      </g>
    </svg>
  );
}
