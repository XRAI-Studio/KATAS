import type { ReactNode } from "react";
import type { Viewport } from "next";

// The shell has no page of its own: "/" is rewritten to the static viewer in public/.
// This layout only exists because Next requires a root layout to build the app; it also
// renders the not-found page, so it carries the viewer's dark-only theme statically
// (class standard 6.6: KATAS is dark-only, no theme head script).
export const metadata = { title: "Isshin Ryu Katas" };
export const viewport: Viewport = { colorScheme: "dark" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" style={{ colorScheme: "dark" }}>
      <body style={{ margin: 0, minHeight: "100vh", background: "#1a140e", color: "#f0e8da" }}>{children}</body>
    </html>
  );
}
