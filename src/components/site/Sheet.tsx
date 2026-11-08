import type { ReactNode } from "react";

/** A crosshair mark for the corners of a drawing frame. */
function Cross({ className }: { className: string }) {
  return (
    <span className={`pointer-events-none absolute h-3 w-3 ${className}`} aria-hidden="true">
      <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-ink-3" />
      <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-ink-3" />
    </span>
  );
}

/**
 * A drawing frame: ruled borders with tick rulers along the edges and crosshairs at the
 * corners. Content sits inside, like a drawing on a sheet.
 */
export function Frame({ children, className = "", rulers = true }: { children: ReactNode; className?: string; rulers?: boolean }) {
  return (
    <div className={`relative ${className}`}>
      {rulers && (
        <>
          <div className="ruler-x absolute inset-x-4 top-0 rotate-180" aria-hidden="true" />
          <div className="ruler-x absolute inset-x-4 bottom-0" aria-hidden="true" />
          <div className="ruler-y absolute inset-y-4 left-0 rotate-180" aria-hidden="true" />
          <div className="ruler-y absolute inset-y-4 right-0" aria-hidden="true" />
        </>
      )}
      <Cross className="-left-1.5 -top-1.5" />
      <Cross className="-right-1.5 -top-1.5" />
      <Cross className="-bottom-1.5 -left-1.5" />
      <Cross className="-bottom-1.5 -right-1.5" />
      {children}
    </div>
  );
}

/** A section of a page with a sheet number and title, like a numbered drawing. */
export function Section({ id, sheet, title, intro, children, className = "" }: { id?: string; sheet: string; title: ReactNode; intro?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`border-b border-rule ${className}`}>
      <div className="mx-auto max-w-[1440px]">
        <div className="grid border-b border-rule md:grid-cols-[14rem_1fr]">
          <div className="border-b border-rule p-5 md:border-b-0 md:border-r">
            <p className="label text-ink-3">Sheet {sheet}</p>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-[1fr_minmax(0,26rem)] md:p-8">
            <h2 className="text-balance text-3xl font-semibold leading-[1.02] tracking-[-0.03em] md:text-5xl">{title}</h2>
            {intro && <div className="self-end text-pretty text-ink-2">{intro}</div>}
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}
