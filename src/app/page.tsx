import Link from "next/link";

export default function Home() {
  return (
    <main className="grid min-h-dvh place-items-center p-8">
      <Link href="/studio/try" className="label border border-ink px-4 py-3 hover:bg-ink hover:text-paper">
        Open the studio
      </Link>
    </main>
  );
}
