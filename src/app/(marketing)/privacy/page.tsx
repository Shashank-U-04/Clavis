import type { Metadata } from "next";
import { LegalPage } from "@/components/site/LegalPage";

export const metadata: Metadata = { title: "Privacy", description: "What Clavis stores, where, and what is sent to a hosted model." };

export default function PrivacyPage() {
  return (
    <LegalPage
      href="/privacy"
      title="Privacy"
      updated="8 November 2026"
      intro="Short version: without an account, your designs stay in your browser. When the hosted assistant is used, the request and a summary of the design go to the model provider to produce an answer."
      clauses={[
        ["Designs", <p key="d">The studio saves your projects in this browser&apos;s local storage. They are not uploaded. Clearing the browser&apos;s site data removes them, so export anything you want to keep.</p>],
        [
          "The assistant",
          <>
            <p>Clavis Local runs entirely in your browser. Requests it hands to the hosted model are sent, with a summary of the current design (rooms, walls, openings, furniture and findings), to our server and on to the model provider to produce a proposal. The API key never reaches your browser.</p>
            <p>The server logs only technical details of such requests — timing, size, success or failure — not their content.</p>
          </>,
        ],
        ["Accounts", <p key="a">Accounts are coming. When they arrive, your email address and the projects you choose to save will be stored with our database provider and kept private to you. This page will be updated before that happens.</p>],
        ["Cookies and tracking", <p key="c">Clavis sets no advertising or analytics cookies and does not track you across sites. The studio stores a few preferences, such as your layout and assistant mode, in local storage.</p>],
      ]}
    />
  );
}
