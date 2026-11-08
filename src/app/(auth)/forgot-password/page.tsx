import type { Metadata } from "next";
import { ForgotForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false } };

export default function Page() {
  return (
    <>
      <h1 className="text-4xl font-semibold tracking-[-0.03em]">Reset your password.</h1>
      <p className="mt-3 text-ink-2">Enter your email and we'll send you a link to choose a new password.</p>
      <div className="mt-8">
        <ForgotForm />
      </div>
    </>
  );
}
