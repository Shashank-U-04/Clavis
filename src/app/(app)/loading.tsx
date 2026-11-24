/** While an app page loads: the sheet's outline, so the frame does not jump when it arrives. */
export default function Loading() {
  return (
    <div className="border-x border-rule" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="border-b border-rule px-5 py-8 md:px-8">
        <div className="h-3 w-24 animate-pulse bg-paper-3" />
        <div className="mt-4 h-8 w-72 max-w-full animate-pulse bg-paper-2" />
      </div>
      <div className="grid gap-px bg-rule sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-paper p-5 md:p-6">
            <div className="aspect-[4/3] animate-pulse bg-paper-2" />
            <div className="mt-4 h-4 w-2/3 animate-pulse bg-paper-2" />
            <div className="mt-2 h-3 w-1/3 animate-pulse bg-paper-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
