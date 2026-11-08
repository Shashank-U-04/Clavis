import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "outline" | "ghost";

const STYLE: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-marker",
  outline: "border border-ink text-ink hover:bg-ink hover:text-paper",
  ghost: "text-ink hover:text-marker",
};

const base = "label inline-flex items-center justify-between gap-6 px-4 py-3 transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50";

/** A link styled as a button, with the drafting arrow. */
export function ButtonLink({ href, variant = "primary", children, arrow = true, className = "", ...rest }: { href: string; variant?: Variant; children: ReactNode; arrow?: boolean } & Omit<ComponentProps<typeof Link>, "href">) {
  return (
    <Link href={href} className={`${base} ${STYLE[variant]} ${className}`} {...rest}>
      <span>{children}</span>
      {arrow && <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />}
    </Link>
  );
}

export function Button({ variant = "primary", children, className = "", arrow = false, ...rest }: { variant?: Variant; arrow?: boolean } & ComponentProps<"button">) {
  return (
    <button className={`${base} ${STYLE[variant]} ${className}`} {...rest}>
      <span>{children}</span>
      {arrow && <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />}
    </button>
  );
}
