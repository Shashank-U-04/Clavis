import type { Metadata } from "next";
import { StudioLoader } from "./StudioLoader";

export const metadata: Metadata = {
  title: "Studio",
  description: "Design a home, check it and walk through it. Your work is saved to your account as you go.",
};

export default function TryStudioPage() {
  return <StudioLoader />;
}
