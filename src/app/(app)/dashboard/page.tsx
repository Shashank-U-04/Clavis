import type { Metadata } from "next";
import { Home } from "@/components/app/Home";
import { TemplateStrip } from "@/components/app/TemplateGallery";
import { templateCards } from "@/components/app/templateData";

export const metadata: Metadata = { title: "Home", robots: { index: false } };

export default function HomePage() {
  const cards = templateCards();
  // the showcase first, then the smallest homes: the ones most people start from
  const strip = [...cards.filter((c) => c.featured), ...cards.filter((c) => !c.featured).sort((a, b) => a.facts.area - b.facts.area)].slice(0, 4);
  return <Home templates={<TemplateStrip cards={strip} />} />;
}
