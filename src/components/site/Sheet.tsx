import { Fragment, type CSSProperties, type ReactNode } from "react";

/**
 * A line of text split into words that rise into place one after another when it scrolls into
 * view (see Motion.tsx). Screen readers get the sentence whole; the words are only drawn.
 */
export function Words({ text, start = 0 }: { text: string; start?: number }) {
  const words = text.split(" ");
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((w, i) => (
          <Fragment key={i}>
            <span className="w">
              <span style={{ "--i": start + i } as CSSProperties}>{w}</span>
            </span>
            {i < words.length - 1 ? " " : ""}
          </Fragment>
        ))}
      </span>
    </>
  );
}

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

/** A section of a page: its title and a short introduction, then its content. */
export function Section({ id, title, intro, children, className = "" }: { id?: string; title: ReactNode; intro?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`border-b border-rule ${className}`}>
      <div className="mx-auto max-w-[1440px]">
        <div className="rule-draw relative border-b border-rule">
          <div className="grid gap-4 p-5 md:grid-cols-[1fr_minmax(0,26rem)] md:p-8">
            <h2 className={`text-balance text-3xl font-semibold leading-[1.02] tracking-[-0.03em] md:text-5xl ${typeof title === "string" ? "words" : ""}`} data-reveal>
              {typeof title === "string" ? <Words text={title} /> : title}
            </h2>
            {intro && (
              <div className="self-end text-pretty text-ink-2" data-reveal style={{ "--i": 3 } as CSSProperties}>
                {intro}
              </div>
            )}
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}
