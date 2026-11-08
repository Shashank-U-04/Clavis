import type { ReactNode } from "react";
import { PageHeader } from "./PageHeader";

/** Plain-language legal pages: numbered clauses in a single readable column. */
export function LegalPage({ href, title, updated, intro, clauses }: { href: string; title: string; updated: string; intro: ReactNode; clauses: [string, ReactNode][] }) {
  return (
    <>
      <PageHeader trail={[{ href, label: title }]} title={title} intro={intro}>
        <p className="label text-ink-3">Last updated {updated}</p>
      </PageHeader>
      <div className="border-b border-rule">
        <ol className="mx-auto max-w-[1440px]">
          {clauses.map(([t, body], i) => (
            <li key={t} className="grid border-b border-rule-soft last:border-0 md:grid-cols-[14rem_1fr]">
              <p className="label p-5 text-ink-3 md:border-r md:border-rule md:p-8">
                {String(i + 1).padStart(2, "0")} · {t}
              </p>
              <div className="max-w-3xl space-y-3 p-5 pt-0 leading-relaxed text-ink-2 md:p-8">{body}</div>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
