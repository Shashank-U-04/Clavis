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
