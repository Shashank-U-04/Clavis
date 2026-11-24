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

        title="Start from a home that works"
        intro={`${cards.length} homes, each a different kind: drawn by hand, with no errors or warnings, and room to walk through every door.`}
      />
      <TemplateGallery cards={cards} />
    </>
  );
}
