import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Clavis — describe a home, check it, walk through it", template: "%s · Clavis" },
  description:
    "Design a home in plain language. Clavis lays it out in metres, checks every wall, door, window and piece of furniture, and lets you walk through it in 3D.",
  applicationName: "Clavis",
  icons: { icon: "/favicon.svg" },
  openGraph: { type: "website", siteName: "Clavis", title: "Clavis — describe a home, check it, walk through it" },
};

export const viewport: Viewport = { themeColor: "#f2efe7", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh bg-paper font-sans text-ink">{children}</body>
    </html>
  );
}
