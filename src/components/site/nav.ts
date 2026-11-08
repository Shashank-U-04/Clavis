/** One list of destinations for the header, the mobile menu and the footer. */

export const FEATURES = [
  { href: "/features/ai-design", title: "Design by describing", blurb: "A sentence becomes a furnished, validated plan." },
  { href: "/features/validation", title: "The validator", blurb: "Thirty geometric and habitability checks on every change." },
  { href: "/features/3d", title: "Plan, 3D and walk", blurb: "Side-by-side views and a walk through from the front door." },
  { href: "/features/projects", title: "Projects and export", blurb: "Autosave, versions, SVG drawings and 3D models." },
] as const;

export const NAV = [
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/docs", label: "Docs" },
  { href: "/about", label: "About" },
] as const;

export const FOOTER = [
  { title: "Product", links: [{ href: "/features", label: "Features" }, ...FEATURES.map((f) => ({ href: f.href, label: f.title })), { href: "/studio/try", label: "Open the studio" }] },
  { title: "Learn", links: [{ href: "/how-it-works", label: "How it works" }, { href: "/docs", label: "Docs" }, { href: "/docs#shortcuts", label: "Shortcuts" }] },
  { title: "Account", links: [{ href: "/login", label: "Sign in" }, { href: "/signup", label: "Create an account" }, { href: "/dashboard", label: "Dashboard" }] },
  { title: "Clavis", links: [{ href: "/about", label: "About" }, { href: "/privacy", label: "Privacy" }, { href: "/terms", label: "Terms" }] },
] as const;
