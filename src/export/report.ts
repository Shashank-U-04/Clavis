/**
 * A design's report as a PDF: a cover with the design's numbers and a view of it in 3D, the
 * floor plan of each floor to scale, the house in 3D from four corners and from the front, and
 * for every floor its rooms, its doors and windows, and every piece of furniture and fitting
 * with its name and size. Made in the browser (landscape A4); nothing is sent anywhere.
 */

import type { PlanModel } from "../model/types";
import { onLevel } from "../model/levels";
import { planToSvg, safeName } from "./planSvg";
import { FURNITURE_HEAD, OPENING_HEAD, ROOM_HEAD, reportData, type ReportData } from "./reportData";
import { render3dViews, type View3D } from "./report3d";

const INK: [number, number, number] = [21, 23, 28];
const GREY: [number, number, number] = [110, 114, 120];
const MARKER: [number, number, number] = [39, 71, 212];
const PAGE = { w: 297, h: 210, margin: 14 };

/** An SVG drawing as a PNG, at up to `max` pixels on its long side. */
async function svgToPng(svg: string, max = 2800): Promise<{ png: string; w: number; h: number }> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const scale = Math.min(3, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { png: canvas.toDataURL("image/png"), w: canvas.width, h: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Fit a w × h picture into a box, centred. */
const fit = (w: number, h: number, box: { x: number; y: number; w: number; h: number }) => {
  const s = Math.min(box.w / w, box.h / h);
  return { x: box.x + (box.w - w * s) / 2, y: box.y + (box.h - h * s) / 2, w: w * s, h: h * s };
};

export async function makeReport(model: PlanModel, onStep: (step: string) => void = () => {}): Promise<{ blob: Blob; filename: string }> {
  onStep("Measuring the design");
  const data = reportData(model);
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  onStep("Drawing the floor plans");
  const plans = [];
  for (const f of data.floors) plans.push({ name: f.name, ...(await svgToPng(planToSvg(onLevel(model, f.id), { title: `${data.name} · ${f.name}`, date }))) });

  onStep("Taking the 3D views");
  const views = await render3dViews(model);

  onStep("Laying out the report");
  const blob = await layoutReport(data, plans, views, date);
  return { blob, filename: `${safeName(data.name)}-report.pdf` };
}

/** Lay the report out as a PDF from its numbers, its plan drawings and its 3D views. */
export async function layoutReport(data: ReportData, plans: { name: string; png: string; w: number; h: number }[], views: View3D[], date: string): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  const heading = (title: string, kicker?: string) => {
    if (kicker) {
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MARKER);
      doc.text(kicker.toUpperCase(), PAGE.margin, PAGE.margin + 2);
    }
    doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(...INK);
    doc.text(title, PAGE.margin, PAGE.margin + 10);
    return PAGE.margin + 16;
  };

  // ---- cover
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MARKER);
  doc.text("CLAVIS · DESIGN REPORT", PAGE.margin, PAGE.margin + 2);
  doc.setFont("helvetica", "bold").setFontSize(30).setTextColor(...INK);
  doc.text(data.name, PAGE.margin, PAGE.margin + 16);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...GREY);
  doc.text(date, PAGE.margin, PAGE.margin + 23);
  autoTable(doc, {
    startY: PAGE.margin + 32,
    margin: { left: PAGE.margin },
    tableWidth: 95,
    body: data.summary,
    theme: "plain",
    styles: { fontSize: 10, textColor: INK, cellPadding: { top: 2.2, bottom: 2.2, left: 0, right: 2 }, lineColor: [210, 210, 204], lineWidth: { bottom: 0.2 } },
    columnStyles: { 0: { textColor: GREY, cellWidth: 45 } },
  });
  doc.setFontSize(8).setTextColor(...GREY);
  doc.text(doc.splitTextToSize("Rules of thumb for early design, not a building-code review. Plans are drawn to scale in metres; sizes of furniture are typical, not those of a specific product.", 95), PAGE.margin, lastY() + 8);
  if (views[0]) {
    const r = fit(16, 10, { x: 118, y: PAGE.margin, w: PAGE.w - 118 - PAGE.margin, h: PAGE.h - PAGE.margin * 2 });
    doc.addImage(views[0].png, "PNG", r.x, r.y, r.w, r.h);
  }

  // ---- floor plans
  for (const p of plans) {
    doc.addPage();
    const top = heading(p.name, "Floor plan");
    const r = fit(p.w, p.h, { x: PAGE.margin, y: top, w: PAGE.w - PAGE.margin * 2, h: PAGE.h - top - PAGE.margin - 4 });
    doc.addImage(p.png, "PNG", r.x, r.y, r.w, r.h);
  }

  // ---- 3D views: four corners on one page, the front view on the next
  doc.addPage();
  let top = heading("The design in 3D", "Views");
  const cellW = (PAGE.w - PAGE.margin * 2 - 6) / 2;
  const cellH = (PAGE.h - top - PAGE.margin - 14) / 2;
  views.slice(0, 4).forEach((v, i) => {
    const x = PAGE.margin + (i % 2) * (cellW + 6);
    const y = top + Math.floor(i / 2) * (cellH + 7);
    const r = fit(16, 10, { x, y, w: cellW, h: cellH });
    doc.addImage(v.png, "PNG", r.x, r.y, r.w, r.h);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GREY);
    doc.text(v.label, r.x, r.y + r.h + 4);
  });
  if (views[4]) {
    doc.addPage();
    top = heading(views[4].label, "Views");
    const r = fit(16, 10, { x: PAGE.margin, y: top, w: PAGE.w - PAGE.margin * 2, h: PAGE.h - top - PAGE.margin - 4 });
    doc.addImage(views[4].png, "PNG", r.x, r.y, r.w, r.h);
  }

  // ---- measurements, floor by floor
  const table = (title: string, head: string[], body: string[][], startY: number, columns: Record<string, { halign?: "left" | "right" | "center"; cellWidth?: number }> = {}) => {
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...INK);
    doc.text(title, PAGE.margin, startY);
    autoTable(doc, {
      startY: startY + 3,
      margin: { left: PAGE.margin, right: PAGE.margin, top: PAGE.margin + 4, bottom: PAGE.margin + 4 },
      head: [head],
      body: body.length ? body : [[`None on this floor`]],
      theme: "grid",
      styles: { fontSize: 8.5, textColor: INK, lineColor: [205, 205, 198], lineWidth: 0.15, cellPadding: 1.8 },
      headStyles: { fillColor: [21, 23, 28], textColor: [241, 240, 234], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [247, 246, 241] },
      columnStyles: columns,
    });
    return lastY() + 10;
  };
  for (const f of data.floors) {
    doc.addPage();
    let y = heading(f.name, "Measurements");
    y = table("Rooms", ROOM_HEAD, f.rooms, y + 2);
    if (y > PAGE.h - 40) (doc.addPage(), (y = PAGE.margin + 8));
    y = table("Doors and windows", OPENING_HEAD, f.openings, y);
    if (y > PAGE.h - 40) (doc.addPage(), (y = PAGE.margin + 8));
    table("Furniture and fittings", FURNITURE_HEAD, f.furniture, y, { 3: { halign: "right", cellWidth: 18 } });
  }

  // ---- page footers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...GREY);
    doc.text(`Clavis · ${data.name} · ${date}`, PAGE.margin, PAGE.h - 7);
    doc.text(`${i} / ${pages}`, PAGE.w - PAGE.margin, PAGE.h - 7, { align: "right" });
  }

  return doc.output("blob");
}

/** Make the report and hand it to the browser to save. */
export async function downloadReport(model: PlanModel, onStep?: (step: string) => void) {
  const { blob, filename } = await makeReport(model, onStep);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
