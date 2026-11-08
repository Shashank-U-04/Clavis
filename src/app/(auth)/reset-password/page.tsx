import type { Metadata } from "next";
import { ResetForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "New password", robots: { index: false } };

export default function Page() {
  return (
    <>
      <h1 className="text-4xl font-semibold tracking-[-0.03em]">Choose a new password.</h1>
      <p className="mt-3 text-ink-2">Pick something you don't use anywhere else.</p>
      <div className="mt-8">
        <ResetForm />
      </div>
    </>
  );
}
