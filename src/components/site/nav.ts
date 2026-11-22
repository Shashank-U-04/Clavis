/** One list of destinations for the header, the mobile menu and the footer. */

export const FEATURES = [
  { href: "/features/ai-design", title: "Design by describing", blurb: "Describe the home and get a furnished floor plan to scale, then change it in words." },
  { href: "/features/validation", title: "Problems pointed out", blurb: "Blocked doors, unreachable rooms and dark bedrooms, marked on the plan as you work." },
  { href: "/features/3d", title: "Plan, 3D and walk", blurb: "The plan and a live 3D model side by side, and a walk through from the front door." },
  { href: "/features/projects", title: "Projects and export", blurb: "Saved as you work, on any device once you sign in, and exported as a plan or a 3D model." },
] as const;

export const NAV = [
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/docs", label: "Docs" },
  { href: "/about", label: "About" },
] as const;
