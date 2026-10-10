import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GlobalError from "@/app/global-error";
import { ERROR_PAGE_STYLE } from "@/lib/error-page-style";

// KATAS is dark-only (class standard 6.6). The pages that render outside the root layout
// (global-error and the static production 500 page) are dark on their own, whatever the OS.
describe("global-error is statically dark", () => {
  const html = renderToString(createElement(GlobalError, { error: new Error("x"), retry: () => {} }));

  it("carries data-theme and color-scheme dark, and no theme head script", () => {
    expect(html).toMatch(/<html lang="en" data-theme="dark" style="color-scheme:dark">/);
    expect(html).toContain('<meta name="color-scheme" content="dark"/>');
    expect(html).not.toMatch(/ts_theme|TSTheme/);
  });

  it("uses the shared error-page styles and a 44px Try again", () => {
    expect(html).toContain(ERROR_PAGE_STYLE.trim().split("\n")[0]);
    expect(html).toMatch(/<button class="action" type="button">Try again<\/button>/);
  });
});

describe("static production 500 page (same gap as Codex PORTAL-APPEARANCE-012)", () => {
  it("exists as a Pages Router 500 page, so Next keeps it instead of its OS-themed built-in", () => {
    const src = readFileSync("src/pages/500.tsx", "utf8");
    expect(src).toContain("ERROR_PAGE_STYLE");
    expect(src).toMatch(/<a className="action" href="">/);
    expect(readFileSync("src/pages/_document.tsx", "utf8")).toMatch(/<Html lang="en" data-theme="dark" style=\{\{ colorScheme: "dark" \}\}>/);
  });

  it("styles are dark unconditionally: 16px text, 44px action, no OS media rule", () => {
    expect(ERROR_PAGE_STYLE).toMatch(/:root \{ color-scheme: dark;/);
    expect(ERROR_PAGE_STYLE).toMatch(/body \{[^}]*font: 16px[^}]*background: #1a140e; color: #f0e8da;/);
    expect(ERROR_PAGE_STYLE).toMatch(/p \{ font-size: 1rem; \}/);
    expect(ERROR_PAGE_STYLE).toMatch(/\.action \{[^}]*min-height: 44px; min-width: 44px;/);
    expect(ERROR_PAGE_STYLE).not.toMatch(/prefers-color-scheme/);
  });
});
