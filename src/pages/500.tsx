import Head from "next/head";
import { ERROR_PAGE_STYLE } from "@/lib/error-page-style";

// The static production 500 page. Without this file Next copies its own built-in fallback
// (styled from the OS colour scheme, 14px text, a 32px button) to pages/500.html and serves
// it for unhandled server errors; a Pages Router 500 page is the supported override
// (next/dist/build/index.js moveExportedAppGlobalErrorTo500 keeps an existing one). KATAS is
// dark-only (class standard 6.6): no head script, statically dark (pages/_document.tsx sets
// data-theme and color-scheme on <html>). "Reload" is a plain link to the same address, so
// it works before or without JavaScript.
export default function ServerError() {
  return (
    <>
      <Head>
        <meta name="color-scheme" content="dark" />
        <style dangerouslySetInnerHTML={{ __html: ERROR_PAGE_STYLE }} />
        <title>Something went wrong · Isshin Ryu Katas</title>
      </Head>
      <main>
        <h1>Something went wrong</h1>
        <p>The page could not load. Reload it, or come back in a minute.</p>
        <a className="action" href="">
          Reload
        </a>
      </main>
    </>
  );
}
