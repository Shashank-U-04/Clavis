import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AccountBridge } from "@/components/account/AccountBridge";
import { THEME_SCRIPT } from "@/lib/theme";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

/** The public address: set explicitly, else the production domain Vercel provides, else local dev. */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:5199");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Clavis — describe a home, check it, walk through it", template: "%s · Clavis" },
  description:
    "Design a home in plain language. Clavis lays it out in metres, checks every wall, door, window and piece of furniture, and lets you walk through it in 3D.",
  applicationName: "Clavis",
  icons: { icon: "/favicon.svg" },
  openGraph: { type: "website", siteName: "Clavis", title: "Clavis — describe a home, check it, walk through it" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f0ea" },
    { media: "(prefers-color-scheme: dark)", color: "#121417" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // the theme script sets the "dark" class before React runs, so <html> may differ from the server's
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-paper font-sans text-ink">
        {children}
        <AccountBridge />
      </body>
    </html>
  );
}
