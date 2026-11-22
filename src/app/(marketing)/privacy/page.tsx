import type { Metadata } from "next";
import { LegalPage } from "@/components/site/LegalPage";

export const metadata: Metadata = { title: "Privacy", description: "What Clavis stores, where, and what is sent to a hosted model." };

export default function PrivacyPage() {
  return (
    <LegalPage
      href="/privacy"
      title="Privacy"
      updated="22 November 2026"
      intro="Short version: you sign in with Google, and your projects are kept in your account, where only you can open them. When the hosted assistant is used, the request and a summary of the design go to the AI model provider to produce an answer."
      clauses={[
        [
          "Your account",
          <p key="a">You sign in with your Google account. Google tells us your name, email address and profile picture, which we keep with our database provider to identify your account. We never see your Google password.</p>,
        ],
        [
          "Designs",
          <p key="d">Your projects, with their versions and history, are stored in our database under rules that let only your account read or change them. While you work, a copy is kept in this browser&apos;s local storage so the studio stays quick; signing out removes that copy. You can export any project at any time.</p>,
        ],
        [
          "The assistant",
          <>
            <p>Clavis Local runs entirely in your browser. Requests it hands to the hosted model are sent, with a summary of the current design (rooms, walls, openings, furniture and findings), to our server and on to the model provider to produce a proposal. The API key never reaches your browser. Choose Clavis Local in Settings and no request leaves your browser.</p>
            <p>We count how many hosted requests your account makes each day, to apply the daily allowance. The server logs only technical details of these requests (timing, size, success or failure), not their content.</p>
          </>,
        ],
        ["Cookies and tracking", <p key="c">Signing in sets cookies that keep you signed in. Clavis sets no advertising or analytics cookies and does not track you across sites. The studio keeps a few preferences, such as your layout and assistant mode, in local storage.</p>],
      ]}
    />
  );
}
