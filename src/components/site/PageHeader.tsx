import Link from "next/link";
import type { ReactNode } from "react";
import { Frame } from "./Sheet";

/** The top of an inner page: where you are, a title and a short introduction. */
export function PageHeader({ trail, title, intro, children }: { trail: { href: string; label: string }[]; title: ReactNode; intro?: ReactNode; children?: ReactNode }) {
  return (
    <section className="border-b border-rule">
      <div className="mx-auto max-w-[1440px]">
        <Frame className="px-5 py-12 md:px-12 md:py-20" rulers={false}>
          <nav aria-label="Breadcrumb" className="label flex flex-wrap gap-2 text-ink-3">
            <Link href="/" className="hover:text-ink">
              Clavis
            </Link>
            {trail.map((t) => (
              <span key={t.href} className="flex gap-2">
                <span aria-hidden="true">/</span>
                <Link href={t.href} className="hover:text-ink">
                  {t.label}
                </Link>
              </span>
            ))}
          </nav>
          <h1 className="mt-8 max-w-5xl text-balance text-[clamp(2.2rem,5.5vw,4.6rem)] font-semibold leading-[0.98] tracking-[-0.035em]">{title}</h1>
          {intro && <div className="mt-6 max-w-2xl text-pretty text-lg text-ink-2">{intro}</div>}
          {children && <div className="mt-8">{children}</div>}
        </Frame>
      </div>
    </section>
  );
}
