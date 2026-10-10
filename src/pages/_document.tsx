import { Html, Head, Main, NextScript } from "next/document";

// The document for the Pages Router pages (only the static 500 page, pages/500.tsx). KATAS is
// dark-only (class standard 6.6), so <html> carries the dark theme statically, like
// public/index.html and the app layout.
export default function Document() {
  return (
    <Html lang="en" data-theme="dark" style={{ colorScheme: "dark" }}>
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
