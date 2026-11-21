/**
 * Building the catalogue's templates into designs, and the numbers shown for each. This pulls
 * in Clavis Local, so it is imported by the studio and by server-rendered pages only.
 */

import { localProposal } from "@/ai/local/engine";
import type { AssistantRequest } from "@/ai/contract";
import { analyzeModel } from "@/model/analysis";
import { applyBatch } from "@/model/operations";
import { cedarVillaModel, sunsetLoftModel, templateModel } from "@/model/templates";
import { emptyModel, type PlanModel } from "@/model/types";
import { findTemplate } from "./catalogue";

/** Build a template's design. Unknown slugs fall back to the compact two-bedroom. */
export function buildTemplate(slug: string): PlanModel {
  const t = findTemplate(slug);
  if (!t || t.slug === "compact-two-bedroom") return { ...templateModel(), name: t?.name ?? "Compact two-bedroom" };
  if (t.slug === "sunset-loft") return sunsetLoftModel();
  if (t.slug === "cedar-villa") return cedarVillaModel();
  const req: AssistantRequest = { mode: "design", instruction: t.brief!, context: { design: {} } };
  let n = 0;
  const out = applyBatch(emptyModel(), localProposal(req, emptyModel()).operations, (p) => `${p}_${(n++).toString(36)}`);
  return { ...out.model, name: t.name };
}

export interface TemplateFacts {
  area: number;
  bedrooms: number;
  bathrooms: number;
  rooms: number;
  items: number;
  /** the outer size, metres */
  width: number;
  depth: number;
}

export function templateFacts(m: PlanModel): TemplateFacts {
  const a = analyzeModel(m);
  const env = a.metrics.envelope;
  return {
    area: Math.round(a.metrics.carpetArea),
    bedrooms: a.metrics.bedrooms,
    bathrooms: a.metrics.bathrooms,
    rooms: m.rooms.length,
    items: m.items.length,
    width: env ? Math.round(env.w * 10) / 10 : 0,
    depth: env ? Math.round(env.h * 10) / 10 : 0,
  };
}
