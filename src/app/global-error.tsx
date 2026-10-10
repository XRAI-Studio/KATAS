"use client";
import { ERROR_PAGE_STYLE } from "@/lib/error-page-style";

// global-error replaces the root layout, and Next's built-in one follows the OS colour
// scheme. KATAS is dark-only (class standard 6.6): this one is statically dark, with its own
// styles (no head script, nothing to switch). The static production 500 page is
// src/pages/500.tsx, with the same styles.
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en" data-theme="dark" style={{ colorScheme: "dark" }}>
      <head>
        <meta name="color-scheme" content="dark" />
        <style dangerouslySetInnerHTML={{ __html: ERROR_PAGE_STYLE }} />
        <title>Something went wrong · Isshin Ryu Katas</title>
      </head>
      <body>
        <main>
          <h1>Something went wrong</h1>
          <p>Try again, or come back in a minute.</p>
          <button className="action" type="button" onClick={() => retry()}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
