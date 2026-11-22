"use client";

/**
 * Settings: download a design's report. Pick one of your projects and get a PDF with its floor
 * plans to scale, the house in 3D from five angles, and every room, door, window and piece of
 * furniture with its name and size. The report is made in this browser.
 */

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { browserStorage } from "@/model/persistence";
import { listProjects, loadProject, type ProjectMeta } from "@/model/library";

export function ReportDownload() {
  const [plans, setPlans] = useState<ProjectMeta[]>([]);
  const [pick, setPick] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const list = listProjects(browserStorage()).sort((a, b) => b.updatedAt - a.updatedAt);
    setPlans(list);
    setPick((p) => p || list[0]?.id || "");
  }, []);

  const make = async () => {
    setError(null);
    const doc = loadProject(browserStorage(), pick);
    if (!doc.ok) return setError(doc.message);
    try {
      setStep("Starting");
      const { downloadReport } = await import("@/export/report");
      await downloadReport(doc.value.model, setStep);
      setStep("Saved to your downloads");
    } catch (e) {
      console.error("[clavis] report failed", e);
      setStep(null);
      setError("The report could not be made in this browser. Try again, or in another browser.");
    }
  };
  const busy = step !== null && step !== "Saved to your downloads";

  if (!plans.length) return <p className="text-sm text-ink-2">Make a design first; its report will be here.</p>;
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="report-plan">
          Design
        </label>
        <select id="report-plan" value={pick} onChange={(e) => (setPick(e.target.value), setStep(null))} disabled={busy} className="min-w-56 flex-1 border border-rule bg-paper px-3 py-2.5 text-sm">
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.rooms} rooms · {p.area.toFixed(0)} m²
            </option>
          ))}
        </select>
        <button type="button" onClick={make} disabled={busy || !pick} className="label flex items-center gap-2 border border-ink px-4 py-2.5 hover:bg-ink hover:text-paper disabled:opacity-40">
          <FileText size={14} aria-hidden="true" /> {busy ? "Making the report…" : "Download report (PDF)"}
        </button>
      </div>
      {step && (
        <p role="status" className="mt-3 text-sm text-ink-2">
          {step}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-marker">
          {error}
        </p>
      )}
    </div>
  );
}
