import type { Metadata } from "next";
import { ProfileForm } from "@/components/app/ProfileForm";
import { SheetHeader } from "@/components/app/ui";

export const metadata: Metadata = { title: "Profile", robots: { index: false } };

export default function ProfilePage() {
  return (
    <>
      <SheetHeader sheet="F · Profile" title="Your profile" intro="How Clavis greets you, and what you have made so far." />
      <ProfileForm />
    </>
  );
}
