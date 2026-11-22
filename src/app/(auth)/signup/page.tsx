import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default function Page() {
  return (
    <>
      <h1 className="text-4xl font-semibold tracking-[-0.03em]">Start keeping your homes.</h1>
      <p className="mt-3 text-ink-2">Your Google account is all you need. Your projects are kept in it and open on every device.</p>
      <div className="mt-8">
        <SignupForm />
      </div>
    </>
  );
}
