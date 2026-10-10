/**
 * Self-contained styles for the pages that render outside the root layout: app/global-error.tsx
 * and the static production 500 page (pages/500.tsx). KATAS is dark-only (class standard
 * 6.6), so these are dark unconditionally, whatever the OS setting: no data-theme switch and
 * no prefers-color-scheme rule. 16px text, a 44px action, the viewer's palette
 * (public/css/app.css): page #1a140e, text #f0e8da, control #33261a with a #b08d68 border,
 * focus #ffd27a.
 */
export const ERROR_PAGE_STYLE = `
:root { color-scheme: dark; background: #1a140e; }
body { margin: 0; min-height: 100vh; font: 16px/1.5 "Segoe UI", system-ui, sans-serif; background: #1a140e; color: #f0e8da; overflow-wrap: anywhere; }
main { max-width: 32rem; margin: 0 auto; padding: 3rem 1rem; }
h1 { color: #f0e8da; font-size: 1.5rem; }
p { font-size: 1rem; }
.action { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; min-height: 44px; min-width: 44px; font: 600 1rem "Segoe UI", system-ui, sans-serif; padding: 0.5rem 1rem; border-radius: 6px; border: 1px solid #b08d68; background: #33261a; color: #f0e8da; cursor: pointer; text-decoration: none; }
.action:hover { background: #4a3625; }
.action:focus-visible { outline: 2px solid #ffd27a; outline-offset: 2px; }
`;
