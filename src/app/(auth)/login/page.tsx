import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function Page() {
  return (
    <>
      <h1 className="text-4xl font-semibold tracking-[-0.03em]">Welcome back.</h1>
      <p className="mt-3 text-ink-2">Sign in to keep your projects in the cloud. Or open the studio without an account.</p>
      <div className="mt-8">
        <LoginForm />
      </div>
    </>
  );
}
