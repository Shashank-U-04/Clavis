import type { Metadata } from "next";
import { StudioLoader } from "./StudioLoader";

export const metadata: Metadata = {
  title: "Studio",
  description: "Design a home without an account. Your work is saved in this browser.",
};

export default function TryStudioPage() {
  return <StudioLoader />;
}
