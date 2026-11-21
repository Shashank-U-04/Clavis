import type { Metadata } from "next";
import { TemplateGallery } from "@/components/app/TemplateGallery";
import { templateCards } from "@/components/app/templateData";
import { SheetHeader } from "@/components/app/ui";

export const metadata: Metadata = { title: "Templates", description: "Seven homes to start from, from a studio apartment to a five-bedroom villa." };

export default function TemplatesPage() {
  const cards = templateCards();
  return (
    <>
      <SheetHeader
        sheet="D · Templates"
        title="Start from a home that works"
        intro={`${cards.length} templates, each with no errors or warnings from the validator. Four are drawn by hand; the rest are laid out by Clavis Local from a one-line brief.`}
      />
      <TemplateGallery cards={cards} />
    </>
  );
}
