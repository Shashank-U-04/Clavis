import type { Metadata } from "next";
import { LegalPage } from "@/components/site/LegalPage";

export const metadata: Metadata = { title: "Terms", description: "The terms for using Clavis." };

export default function TermsPage() {
  return (
    <LegalPage
      href="/terms"
      title="Terms"
      updated="8 November 2026"
      intro="Clavis is a concept-design tool provided as it is. Use it to explore ideas about a home, not to build one without professional advice."
      clauses={[
        ["Using Clavis", <p key="u">You may use Clavis to create designs for yourself or others. Don&apos;t use it to break the law, to attack the service, or to send it content you have no right to use.</p>],
        ["Your designs", <p key="y">What you design is yours. Clavis claims no ownership of your projects.</p>],
        [
          "Not professional advice",
          <p key="n">
            Areas, daylight ratios, clearances, routes and every other check are early-design rules of thumb. They are not a building-code review, a structural assessment or a survey, and Clavis&apos;s drawings are not construction documents. Consult a qualified professional before building, buying or renovating.
          </p>,
        ],
        ["The assistant", <p key="a">Assistant proposals can be wrong. They are previews you choose to apply, and Clavis reports what actually changed; check the result before relying on it.</p>],
        ["Availability", <p key="v">Clavis is provided as it is, without warranties. Features may change, and the hosted assistant may be unavailable or rate-limited at times.</p>],
        ["Changes", <p key="c">These terms may be updated; the date above shows the latest version.</p>],
      ]}
    />
  );
}
