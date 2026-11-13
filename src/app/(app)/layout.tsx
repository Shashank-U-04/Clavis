import { AppShell } from "@/components/app/AppShell";

/** The signed-in (and guest) area: the sidebar, the top bar, then the page. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
