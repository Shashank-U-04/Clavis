"use client";

/**
 * The last resort, when even the site's frame failed. It renders its own document without the
 * site's styles, so it carries a few of its own and follows the device's light or dark setting.
 */

import { useEffect } from "react";

const CSS = `
  :root { color-scheme: light dark; --paper: #f1f0ea; --ink: #15171c; --ink-2: #43464d; --marker: #2747d4; }
  @media (prefers-color-scheme: dark) { :root { --paper: #121417; --ink: #ecebe5; --ink-2: #b7b9bd; --marker: #7b93ff; } }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: var(--paper); color: var(--ink); font-family: system-ui, sans-serif; }
  main { max-width: 34rem; padding: 2rem; }
  p.eyebrow { font: 600 0.72rem/1 ui-monospace, monospace; letter-spacing: 0.14em; text-transform: uppercase; color: var(--marker); }
  h1 { font-size: 2.2rem; letter-spacing: -0.02em; margin: 0.8rem 0; }
  p { color: var(--ink-2); line-height: 1.5; }
  .row { display: flex; gap: 0.5rem; margin-top: 1.8rem; flex-wrap: wrap; }
  button, a { font: 600 0.75rem/1 ui-monospace, monospace; letter-spacing: 0.1em; text-transform: uppercase; padding: 0.9rem 1rem; border: 1px solid var(--ink); background: var(--ink); color: var(--paper); cursor: pointer; text-decoration: none; }
  a { background: transparent; color: var(--ink); }
`;

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="en">
      <body>
        <title>Something went wrong · Clavis</title>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <main role="alert">
          <p className="eyebrow">Clavis · something went wrong</p>
          <h1>Clavis could not open this page.</h1>
          <p>Your plans are safe: they are saved as you go and kept in your account. Try again, or reload in a moment.</p>
          <div className="row">
            <button type="button" onClick={() => retry()}>
              Try again
            </button>
            <a href="/">Clavis home</a>
          </div>
        </main>
      </body>
    </html>
  );
}
