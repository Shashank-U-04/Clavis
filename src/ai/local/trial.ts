/**
 * Trial application: the local engine's way of "thinking" about a change.
 *
 * Every candidate operation is applied to a scratch copy of the model with the same pipeline
 * the store uses, and the constraint engine judges the result. A candidate is kept only when
 * it introduces no new error or warning. The accepted operations are what the engine
 * proposes, and the app dry-runs them once more before a person sees them.
 */

import { applyBatch } from "../../model/operations";
import { checkModel } from "../../model/issues";
import { blocksApproach } from "./approach";
import type { Issue, PlanModel } from "../../model/types";

export const isProblem = (i: Issue) => i.severity !== "info";

export interface TryResult {
  ok: boolean;
  model: PlanModel;
  problems: Issue[];
  introduced: Issue[];
  resolved: Issue[];
  error?: string;
}

export class Trial {
  model: PlanModel;
  problems: Issue[];
  readonly ops: unknown[] = [];
  /** human-readable notes on what was accepted or skipped, for the rationale */
  readonly notes: string[] = [];
  private n = 0;

  constructor(model: PlanModel) {
    this.model = model;
    this.problems = checkModel(model).filter(isProblem);
  }

  /** Scratch ids. Proposed operations never reference them except through `$alias`. */
  newId = (prefix: string) => `${prefix}_t${(this.n++).toString(36)}`;

  try(ops: unknown[]): TryResult {
    const out = applyBatch(this.model, ops, this.newId);
    if (!out.ok) return { ok: false, model: this.model, problems: this.problems, introduced: [], resolved: [], error: out.error?.message };
    // the engine's own furniture leaves the way into every door clear (approach.ts)
    const had = new Set(this.model.items.map((i) => i.id));
    const inTheWay = out.model.items.find((i) => !had.has(i.id) && blocksApproach(out.model, i));
    if (inTheWay) return { ok: false, model: this.model, problems: this.problems, introduced: [], resolved: [], error: `${inTheWay.kind} would stand in the way into a door` };
    const problems = checkModel(out.model).filter(isProblem);
    const before = new Set(this.problems.map((i) => i.id));
    const after = new Set(problems.map((i) => i.id));
    return {
      ok: true,
      model: out.model,
      problems,
      introduced: problems.filter((i) => !before.has(i.id)),
      resolved: this.problems.filter((i) => !after.has(i.id)),
    };
  }

  accept(ops: unknown[], r: TryResult) {
    this.ops.push(...ops);
    this.model = r.model;
    this.problems = r.problems;
  }

  /** Try each candidate in order; accept the first that introduces nothing and passes `extra`. */
  first(candidates: unknown[][], extra: (r: TryResult) => boolean = () => true): TryResult | null {
    for (const ops of candidates) {
      const r = this.try(ops);
      if (r.ok && r.introduced.length === 0 && extra(r)) {
        this.accept(ops, r);
        return r;
      }
    }
    return null;
  }
}
