import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function Page() {
  return (
    <>
      <h1 className="text-4xl font-semibold tracking-[-0.03em]">Sign in to Clavis.</h1>
      <p className="mt-3 text-ink-2">Use your Google account to open the studio and your projects. It is free.</p>
      <div className="mt-8">
        <LoginForm />
      </div>
    </>
  );
}
