/**
 * The catalogue as card data, built on the server: each template's design is laid out once at
 * build time, measured, and drawn to an SVG, so the gallery costs the visitor no engine work.
 */

import "server-only";
import { TEMPLATES, type TemplateMaker } from "@/lib/catalogue";
import { buildTemplate, templateFacts, type TemplateFacts } from "@/lib/buildTemplate";
import { planToSvg } from "@/export/planSvg";

export interface TemplateCardData {
  slug: string;
  name: string;
  blurb: string;
  maker: TemplateMaker;
  brief?: string;
  featured?: boolean;
  facts: TemplateFacts;
  /** the plan drawing as a data URL */
  thumb: string;
}

let cache: TemplateCardData[] | null = null;

export function templateCards(): TemplateCardData[] {
  cache ??= TEMPLATES.map((t) => {
    const m = buildTemplate(t.slug);
    return { ...t, facts: templateFacts(m), thumb: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(planToSvg(m))}` };
  });
  return cache;
}
