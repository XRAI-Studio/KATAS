/**
 * End-to-end checks for the kata viewer shell (class standard rule 4.1), in two parts:
 *
 *  (a) Shell and gate, production mode: `next build` + `next start` bound to localhost.
 *      Production mode disables the localhost bypass, so plain HTTP requests without a
 *      cookie must get the page gate's 307 to the portal login (with the local origin in
 *      `next=`), assets must answer 200, and every response must carry the four headers.
 *      This proves the proxy is discovered and registered by Next.
 *  (b) Viewer and awards, development mode: `next dev` on localhost with the mock kit.
 *      Playwright drives the viewer through its DOM controls and checks the awards the
 *      mock recorded on window.__kitAwards and the launcher-tile saves (headline text) on
 *      window.__kitSaves, plus the 404s for repository paths, and finally presses "Return
 *      to Home Room" (the portal launcher URL is intercepted). A second page holds the
 *      mock's first load open and leaves during it: the start-up's first save still happens
 *      before the navigation (one tracked start-up operation, R007).
 *      Then the phone pass (class standard rules 6.4 and 6.6): at 375 x 667 the dark-only
 *      page has no sideways scroll and the transport buttons are at least 44 x 44.
 *
 *   npm run e2e            (needs `npx playwright install chromium` once)
 *   E2E_SHOTS_DIR=<dir>    screenshots go there instead of e2e-artifacts/ (gitignored)
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import { chromium, type Page } from "playwright";

const PORTAL_LOGIN = "https://class.travelschooling.com/login?next=";
const HOME_ROOM = "https://class.travelschooling.com/";
const HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || "e2e-artifacts";

function log(msg: string) {
  process.stdout.write(`[e2e] ${msg}\n`);
}

function expectEq<T>(actual: T, expected: T, what: string) {
  if (actual !== expected) throw new Error(`${what}: expected ${String(expected)}, got ${String(actual)}`);
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function waitForServer(base: string, timeoutMs: number) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(base, { redirect: "manual" });
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 750));
  }
  throw new Error(`server at ${base} did not start`);
}

function startNext(args: string[], env: Record<string, string>): ChildProcess {
  const child = spawn("npx", ["next", ...args], {
    env: { ...process.env, BROWSER: "none", ...env },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d) => process.env.E2E_VERBOSE && process.stdout.write(String(d)));
  child.stderr?.on("data", (d) => process.env.E2E_VERBOSE && process.stderr.write(String(d)));
  return child;
}

/** PIDs listening on a port. `npx next` re-spawns the real server, so the shell's PID tree is not enough. */
function listenersOnPort(port: number): number[] {
  try {
    if (process.platform === "win32") {
      const out = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" });
      return [...new Set(out.split(/\r?\n/).filter((l) => l.includes(`:${port} `) && l.includes("LISTENING")).map((l) => Number(l.trim().split(/\s+/).pop())))].filter((n) => n > 0);
    }
    const out = execFileSync("lsof", ["-t", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" });
    return out.split(/\s+/).map(Number).filter((n) => n > 0);
  } catch {
    return [];
  }
}

function killPid(pid: number) {
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(pid, "SIGTERM");
  } catch {
    // already gone
  }
}

function stopServer(child: ChildProcess, port: number) {
  if (child.pid) killPid(child.pid);
  for (const pid of listenersOnPort(port)) killPid(pid);
}

function checkHeaders(res: Response, what: string) {
  for (const [k, v] of Object.entries(HEADERS)) expectEq(res.headers.get(k), v, `${what} header ${k}`);
}

// ---------------------------------------------------------------- part (a)

async function gateInProductionMode() {
  const port = await freePort();
  const base = `http://localhost:${port}`;
  const env = { NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" } as const;
  log("building the shell (next build)");
  const stdio: "inherit" | "ignore" = process.env.E2E_VERBOSE ? "inherit" : "ignore";
  execFileSync("npx", ["next", "build"], { env: { ...process.env, ...env }, shell: true, stdio });
  const server = startNext(["start", "--hostname", "localhost", "--port", String(port)], env);
  try {
    await waitForServer(base, 60_000);
    const get = (p: string) => fetch(base + p, { redirect: "manual" });

    const root = await get("/");
    expectEq(root.status, 307, "GET / without a cookie");
    expectEq(root.headers.get("location"), PORTAL_LOGIN + encodeURIComponent(`${base}/`), "GET / location");
    checkHeaders(root, "GET /");
    log("production: / redirects to the portal login with the local origin in next=");

    const doc = await get("/docs/review-notes.md?x=1");
    expectEq(doc.status, 307, "GET /docs/review-notes.md without a cookie");
    expectEq(doc.headers.get("location"), PORTAL_LOGIN + encodeURIComponent(`${base}/docs/review-notes.md?x=1`), "repository path location");
    log("production: a repository path is gated too (path and query preserved)");

    for (const asset of ["/js/main.js", "/data/seisan.json", "/css/app.css"]) {
      const res = await get(asset);
      expectEq(res.status, 200, `GET ${asset}`);
      checkHeaders(res, `GET ${asset}`);
    }
    log("production: assets answer 200 with the security headers");
  } finally {
    stopServer(server, port);
  }
}

// ---------------------------------------------------------------- part (b)

type Award = { event: string; detail: Record<string, unknown> };
type Save = { state: { rev: number; viewed: string[]; completed: string[] }; summary: { headline: string; percent: number } };

async function awards(page: Page): Promise<Award[]> {
  return page.evaluate(() => (window as unknown as { __kitAwards?: Award[] }).__kitAwards ?? []);
}

/** Waits until the mock kit's most recent save carries `headline`. */
async function lastSaveIs(page: Page, headline: string) {
  await page.waitForFunction(
    (h) => {
      const saves = (window as unknown as { __kitSaves?: Save[] }).__kitSaves ?? [];
      return saves.length > 0 && saves[saves.length - 1].summary.headline === h;
    },
    headline,
    { timeout: 30_000 },
  );
}

/**
 * Leaving while the first kit.load() is still out: the mock holds its load open
 * (window.__kitLoadGate), the viewer boots and records a kata view, the learner presses
 * Return to Home Room, and the page must still be here while the load is out. Releasing
 * the load inside the bounded wait lets the start-up (load, merge, first publish) finish,
 * and its save happens before the navigation. Saves are forwarded out of the page as they
 * happen, since the page is left.
 */
async function leaveDuringDelayedFirstLoad(browser: Awaited<ReturnType<typeof chromium.launch>>, base: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const recorded: Save[] = [];
    let navigatedAfter = -1;
    await context.exposeFunction("__e2eKitSave", (s: Save) => { recorded.push(s); });
    await context.addInitScript(() => {
      const w = window as unknown as { __kitLoadGate?: Promise<void>; __releaseKitLoad?: () => void; __kitSaves?: unknown[]; __e2eKitSave?: (s: unknown) => void };
      w.__kitLoadGate = new Promise<void>((resolve) => { w.__releaseKitLoad = resolve; });
      const saves: unknown[] = [];
      const push = saves.push.bind(saves);
      saves.push = (...items: unknown[]) => {
        for (const item of items) w.__e2eKitSave?.(JSON.parse(JSON.stringify(item)));
        return push(...items);
      };
      w.__kitSaves = saves;
    });
    const page = await context.newPage();
    await page.route(HOME_ROOM, (route) => {
      navigatedAfter = recorded.length;
      return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Home Room</title>" });
    });
    await page.goto(`${base}/`, { waitUntil: "load" });
    await page.waitForFunction(() => ((window as unknown as { __kitAwards?: Award[] }).__kitAwards ?? []).some((x) => x.event === "kata_view"), null, { timeout: 30_000 });
    expectEq(recorded.length, 0, "no save while the first load is still out");
    const home = page.getByRole("button", { name: "Return to Home Room" });
    const left = page.waitForURL(HOME_ROOM, { timeout: 10_000 });
    await home.click();
    await page.waitForTimeout(400);
    expectEq(page.url().startsWith(base), true, "still here while the first load is out");
    await page.evaluate(() => (window as unknown as { __releaseKitLoad: () => void }).__releaseKitLoad());
    await left;
    expectEq(recorded.length >= 1, true, "the start-up's first save happened");
    expectEq(navigatedAfter >= 1, true, "the first save happened before the navigation");
    expectEq(recorded[0].summary.headline, "1 kata practised", "first save headline");
    log('dev: leaving during a held first load waits for it; the first save ("1 kata practised") lands before navigating');
  } finally {
    await context.close();
  }
}

/**
 * Phone screen (dark-mode and phone plan, 2026-10-08; class standard 6.4, 6.6). KATAS is
 * dark-only, so there is one theme to check: at 375 x 667 the page carries
 * data-theme="dark" and color-scheme dark, never scrolls sideways (also with the bunkai
 * card, the copied link and the error banner showing), the control bar scrolls inside
 * itself instead of covering the dojo, the transport buttons are at least 44 x 44 and in
 * view without scrolling the bar, and the HUD text meets the phone sizes. The 404 page
 * (rendered by the Next shell's layout) is dark too.
 */
async function phoneScreen(browser: Awaited<ReturnType<typeof chromium.launch>>, base: string) {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
  try {
    const page = await context.newPage();
    await page.goto(`${base}/`, { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelectorAll("#kata-select option").length === 5, null, { timeout: 30_000 });
    type Box = { w: number; h: number; top: number; bottom: number; left: number; right: number };
    // No named helpers inside evaluate: tsx (esbuild keepNames) would wrap them in __name,
    // which does not exist in the page.
    const m = await page.evaluate(() => {
      const [controlsBox, prev, play, next, home] = ["#controls", "#btn-prev", "#btn-play", "#btn-next", "#home-room"].map((sel) => {
        const r = document.querySelector(sel)!.getBoundingClientRect();
        return { w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      });
      const [stepFont, timeFont, presetFont] = ["#step-label", "#time-readout", "#camera-presets button"].map((sel) =>
        parseFloat(getComputedStyle(document.querySelector(sel)!).fontSize),
      );
      const html = document.documentElement;
      const controls = document.getElementById("controls")!;
      return {
        theme: html.getAttribute("data-theme"),
        scheme: getComputedStyle(html).colorScheme,
        scrollWidth: html.scrollWidth,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        controls: controlsBox,
        controlsOverflowY: getComputedStyle(controls).overflowY,
        controlsScrollTop: controls.scrollTop,
        transport: [prev, play, next],
        home,
        stepFont,
        timeFont,
        presetFont,
      };
    });
    expectEq(m.theme, "dark", "phone: data-theme");
    expectEq(m.scheme, "dark", "phone: color-scheme");
    expectEq(m.scrollWidth <= m.innerWidth, true, `phone: no sideways scroll (scrollWidth ${m.scrollWidth}, innerWidth ${m.innerWidth})`);
    expectEq(m.controlsOverflowY, "auto", "phone: the control bar scrolls inside itself");
    expectEq(m.controls.h <= m.innerHeight * 0.45, true, `phone: control bar capped (${m.controls.h} px of ${m.innerHeight})`);
    expectEq(m.controlsScrollTop, 0, "phone: control bar starts at the top");
    const inView = (b: Box) => b.left >= 0 && b.right <= m.innerWidth && b.top >= 0 && b.bottom <= m.innerHeight;
    m.transport.forEach((b: Box, i: number) => {
      const name = ["prev", "play", "next"][i];
      expectEq(b.w >= 44 && b.h >= 44, true, `phone: ${name} button ${b.w.toFixed(1)} x ${b.h.toFixed(1)} is at least 44 x 44`);
      expectEq(inView(b), true, `phone: ${name} button in view`);
    });
    expectEq(m.home.h >= 44 && inView(m.home), true, `phone: Return to Home Room ${m.home.h} px tall, in view`);
    expectEq(m.stepFont >= 16, true, `phone: step label ${m.stepFont} px`);
    expectEq(m.timeFont >= 13 && m.presetFont >= 13, true, `phone: captions ${m.timeFont} / ${m.presetFont} px`);
    await page.screenshot({ path: `${SHOTS_DIR}/katas-phone-375.png` });
    log(`phone: 375 x 667 dark, no sideways scroll; transport ${m.transport.map((b: Box) => `${b.w.toFixed(0)}x${b.h.toFixed(0)}`).join(" ")}; bar ${m.controls.h.toFixed(0)} px`);

    // Everything optional showing at once: bunkai card, copied link, error banner.
    await page.evaluate(() => {
      (document.getElementById("toggle-bunkai") as HTMLInputElement).click();
      (document.getElementById("btn-link") as HTMLButtonElement).click();
      const banner = document.getElementById("error-banner")!;
      banner.textContent = "Could not load the kata data. Check your connection and reload the page.";
      banner.classList.remove("hidden");
    });
    await page.waitForFunction(() => !document.getElementById("link-out")!.classList.contains("hidden"), null, { timeout: 10_000 });
    const busy = await page.evaluate(() => {
      const bannerEl = document.getElementById("error-banner")!;
      const text = document.createRange();
      text.selectNodeContents(bannerEl);
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        bannerPaddingRight: parseFloat(getComputedStyle(bannerEl).paddingRight),
        bannerTextTop: text.getBoundingClientRect().top,
        homeBottom: document.getElementById("home-room")!.getBoundingClientRect().bottom,
        bunkaiFont: parseFloat(getComputedStyle(document.getElementById("bunkai-card")!).fontSize),
        linkRight: document.getElementById("link-out")!.getBoundingClientRect().right,
      };
    });
    expectEq(busy.scrollWidth <= busy.innerWidth, true, `phone: no sideways scroll with everything showing (${busy.scrollWidth})`);
    expectEq(busy.linkRight <= busy.innerWidth, true, "phone: the copied link fits");
    expectEq(busy.bannerPaddingRight <= 16, true, `phone: error banner right padding ${busy.bannerPaddingRight} px`);
    expectEq(busy.bannerTextTop >= busy.homeBottom, true, "phone: error banner text starts below the Home Room button");
    expectEq(busy.bunkaiFont >= 16, true, `phone: bunkai card ${busy.bunkaiFont} px`);
    await page.screenshot({ path: `${SHOTS_DIR}/katas-phone-375-busy.png` });
    log("phone: bunkai card, copied link and error banner all fit at 375");

    const res = await page.goto(`${base}/no-such-page`, { waitUntil: "load" });
    expectEq(res?.status(), 404, "phone: 404 status");
    const nf = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute("data-theme"),
      bg: getComputedStyle(document.body).backgroundColor,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expectEq(nf.theme, "dark", "404 data-theme");
    expectEq(nf.bg, "rgb(26, 20, 14)", "404 background");
    expectEq(nf.scrollWidth <= nf.innerWidth, true, "404: no sideways scroll");
    await page.screenshot({ path: `${SHOTS_DIR}/katas-404-375.png` });
    log("phone: the 404 page is dark");
  } finally {
    await context.close();
  }
}

async function viewerInDevelopmentMode() {
  const port = await freePort();
  const base = `http://localhost:${port}`;
  const server = startNext(["dev", "-p", String(port)], { NEXT_PUBLIC_TS_KIT: "mock", NODE_ENV: "development" });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    await waitForServer(base, 90_000);
    browser = await chromium.launch(); // inside the server's try so a launch failure still stops Next
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // The Blender-built avatar (public/assets/karateka.glb) must load and be adopted, not
    // fall back to the procedural mannequin (avatar.js logs which one it kept).
    const avatarLog: string[] = [];
    page.on("console", (m) => { if (m.text().startsWith("karateka:")) avatarLog.push(m.text()); });
    const glbResponse = page.waitForResponse((r) => r.url().endsWith("/assets/karateka.glb"), { timeout: 30_000 });

    await page.goto(`${base}/`, { waitUntil: "load" });
    expectEq(await page.title(), "Isshin Ryu Katas", "title");
    const glb = await glbResponse;
    expectEq(glb.status(), 200, "karateka.glb status");
    const glbType = glb.headers()["content-type"] ?? "";
    if (/text\/html/.test(glbType)) throw new Error(`karateka.glb served as ${glbType} (the page gate or a rewrite answered)`);
    expectEq((await glb.body()).subarray(0, 4).toString("latin1"), "glTF", "karateka.glb magic");
    for (let i = 0; i < 60 && !avatarLog.some((l) => l === "karateka: glb active" || /rejected|failed/.test(l)); i++) await page.waitForTimeout(250);
    expectEq(avatarLog.find((l) => l === "karateka: glb active" || /rejected|failed/.test(l)), "karateka: glb active", "avatar adopted the GLB");
    await page.screenshot({ path: `${SHOTS_DIR}/katas-glb-avatar.png` });
    log(`dev: karateka.glb 200 (${glbType || "no type"}), adopted; screenshot ${SHOTS_DIR}/katas-glb-avatar.png`);
    await page.waitForFunction(() => document.querySelectorAll("#kata-select option").length === 5, null, { timeout: 30_000 });
    expectEq(await page.locator("#error-banner").isVisible(), false, "error banner hidden");
    await page.waitForFunction(() => ((window as unknown as { __kitAwards?: Award[] }).__kitAwards ?? []).length >= 1, null, { timeout: 30_000 });
    let a = await awards(page);
    expectEq(a[0].event, "kata_view", "first award");
    expectEq(a[0].detail.kata, "seisan", "first kata viewed");
    log("dev: viewer booted with the mock kit; kata_view for seisan");
    await lastSaveIs(page, "1 kata practised");
    log('dev: tile save "1 kata practised"');

    // Follow + camera presets (KATAS-AVATAR-002): the glide ends on the performer and the
    // follow-cam's re-acquire moves nothing, for a shared link and for Follow turned on
    // mid-glide. Every animation frame from page load is recorded (the glide lasts ~0.5 s,
    // so recording after the actions would miss the snap).
    type View = { target: number[]; chest: number[]; following: boolean; gliding: boolean; rebase: { count: number; shift: number } };
    await page.addInitScript(`(() => {
      window.__viewTrace = [];
      const step = () => { const d = window.__katasDev; if (d && d.view) window.__viewTrace.push(d.view()); requestAnimationFrame(step); };
      requestAnimationFrame(step);
    })()`);
    const followCheck = async (label: string, act: () => Promise<unknown>) => {
      await page.evaluate("window.__viewTrace && (window.__viewTrace.length = 0)");
      await act();
      await page.waitForTimeout(2000);
      const trace = (await page.evaluate("window.__viewTrace.slice()")) as View[];
      const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      if (trace.length < 5) throw new Error(`${label}: only ${trace.length} frames recorded`);
      const last = trace[trace.length - 1];
      if (!last.following) throw new Error(`${label}: Follow is off`);
      if (dist(last.target, last.chest) > 0.05) throw new Error(`${label}: camera target ${dist(last.target, last.chest).toFixed(2)} m from the performer after the glide`);
      // The glide must end on the performer: the follow-cam re-acquires in the frame the glide
      // ends, and that re-acquire must move nothing (an unfixed glide ends on the preset's
      // world spot, and the re-acquire snaps the view onto the performer).
      const end = trace.findIndex((v, i) => i > 0 && trace[i - 1].gliding && !v.gliding);
      if (end < 0) throw new Error(`${label}: no preset glide observed in ${trace.length} frames`);
      if (trace[end].rebase.count === trace[end - 1].rebase.count) throw new Error(`${label}: no re-acquire at the end of the glide`);
      const snap = trace[end].rebase.shift;
      if (snap > 0.05) throw new Error(`${label}: the follow-cam snapped ${snap.toFixed(2)} m when the glide ended`);
      log(`dev: ${label}: the glide ends on the performer (re-acquire moved ${snap.toFixed(3)} m; ${trace.length} frames)`);
    };
    await followCheck("shared link cam=hands&follow=1 at t=30", () =>
      page.goto(`${base}/?kata=chinto&t=30&cam=hands&follow=1`, { waitUntil: "load" }));
    // Follow turned on after a Side glide has started (rendered frames already gliding): the
    // glide switches to the performer and ends on them, so the re-acquire at its end moves
    // nothing. Continuity at the switch itself is unit-tested (retargetTween).
    await page.evaluate(() => {
      const f = document.getElementById("toggle-follow") as HTMLInputElement;
      if (f.checked) f.click();
      (window as unknown as { __katasDev: { seek: (t: number) => void } }).__katasDev.seek(12);
    });
    await page.waitForTimeout(600);
    await followCheck("Follow turned on mid-glide", async () => {
      await page.evaluate(() => ([...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Side") as HTMLButtonElement).click());
      await page.waitForFunction(() => (window as unknown as { __viewTrace: Array<{ gliding: boolean }> }).__viewTrace.some((v) => v.gliding), null, { timeout: 10_000 });
      await page.evaluate(() => (document.getElementById("toggle-follow") as HTMLInputElement).click());
    });
    await page.goto(`${base}/`, { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelectorAll("#kata-select option").length === 5, null, { timeout: 30_000 });

    await page.selectOption("#kata-select", "seiunchin.json");
    await page.waitForFunction(() => ((window as unknown as { __kitAwards?: Award[] }).__kitAwards ?? []).filter((x) => x.event === "kata_view").length === 2, null, { timeout: 30_000 });
    log("dev: kata_view on kata change");
    await lastSaveIs(page, "2 katas practised");
    log('dev: tile save "2 katas practised"');

    // Two new furthest steps.
    await page.click("#btn-next");
    await page.click("#btn-next");
    a = await awards(page);
    const steps = a.filter((x) => x.event === "kata_step" && x.detail.kata === "seiunchin").map((x) => x.detail.step as number);
    expectEq(JSON.stringify(steps), JSON.stringify([1, 2]), "kata_step awards after two next presses");
    log("dev: kata_step for steps 1 and 2");

    // Back to the start and forward again: no new furthest, no new awards.
    await page.evaluate(() => (window as unknown as { __katasDev: { seek: (t: number) => void } }).__katasDev.seek(0));
    await page.click("#btn-next");
    await page.click("#btn-next");
    a = await awards(page);
    expectEq(a.filter((x) => x.event === "kata_step").length, 2, "no kata_step for already-reached steps");
    log("dev: revisiting steps earns nothing");

    // Seek to the end: not a play-through.
    const duration = await page.evaluate(() => (window as unknown as { __katasDev: { player: () => { timeline: { duration: number } } } }).__katasDev.player().timeline.duration);
    await page.evaluate((d) => (window as unknown as { __katasDev: { seek: (t: number) => void } }).__katasDev.seek(d), duration);
    a = await awards(page);
    expectEq(a.filter((x) => x.event === "kata_complete").length, 0, "no kata_complete on a seek to the end");

    // Play from near the end until the player stops: exactly one kata_complete.
    await page.evaluate((d) => (window as unknown as { __katasDev: { seek: (t: number) => void } }).__katasDev.seek(d - 0.5), duration);
    await page.click("#btn-play");
    await page.waitForFunction(() => {
      const p = (window as unknown as { __katasDev: { player: () => { playing: boolean; time: number; timeline: { duration: number } } } }).__katasDev.player();
      return !p.playing && p.time >= p.timeline.duration;
    }, null, { timeout: 30_000 });
    a = await awards(page);
    expectEq(a.filter((x) => x.event === "kata_complete").length, 1, "kata_complete once per play-through");
    expectEq(a.find((x) => x.event === "kata_complete")?.detail.kata, "seiunchin", "kata_complete names the kata");
    log("dev: kata_complete exactly once when playback reaches the end");
    await lastSaveIs(page, "1 of 5 katas completed");
    const lastSave = await page.evaluate(() => {
      const saves = (window as unknown as { __kitSaves: Save[] }).__kitSaves;
      return saves[saves.length - 1];
    });
    expectEq(lastSave.state.rev, 102, "completion-dominant rev (1 completed, 2 viewed)");
    expectEq(lastSave.summary.percent, 20, "tile percent");
    log('dev: tile save "1 of 5 katas completed" (rev 102)');

    expectEq(errors.length, 0, `page errors: ${errors.join(" | ")}`);

    // Return to Home Room: last, because it leaves the viewer. Only the launcher URL
    // itself is intercepted; the kit script is served from the same origin.
    const homeRoom = page.getByRole("button", { name: "Return to Home Room" });
    expectEq(await homeRoom.isVisible(), true, "Return to Home Room button visible");
    await page.route(HOME_ROOM, (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Home Room</title>" }),
    );
    await Promise.all([page.waitForURL(HOME_ROOM, { timeout: 10_000 }), homeRoom.click()]);
    expectEq(page.url(), HOME_ROOM, "Return to Home Room destination");
    log("dev: Return to Home Room is visible and navigates to the portal launcher");

    // Back to the viewer (restored from the back/forward cache or reloaded), then the
    // keyboard: Space on the focused button activates it rather than toggling playback.
    await page.goBack({ waitUntil: "load" });
    await page.waitForFunction(() => document.querySelectorAll("#kata-select option").length === 5, null, { timeout: 30_000 });
    await homeRoom.focus();
    await Promise.all([page.waitForURL(HOME_ROOM, { timeout: 10_000 }), page.keyboard.press("Space")]);
    expectEq(page.url(), HOME_ROOM, "Return to Home Room by keyboard after Back");
    expectEq(errors.length, 0, `page errors after Back: ${errors.join(" | ")}`);
    log("dev: after Back, Space on the focused button returns to the Home Room again");

    for (const p of ["/docs/review-notes.md", "/tools/validate-data.mjs", "/tests/player.test.mjs"]) {
      const res = await fetch(base + p, { redirect: "manual" });
      expectEq(res.status, 404, `GET ${p} (dev, gate bypassed)`);
    }
    expectEq((await fetch(`${base}/index.html`, { redirect: "manual" })).status, 200, "GET /index.html");
    log("dev: repository paths are 404, the viewer page is 200");

    await leaveDuringDelayedFirstLoad(browser, base);
    await phoneScreen(browser, base);
  } finally {
    // Nested so the dev server is stopped even when the browser never launched or
    // refuses to close.
    try {
      if (browser) await browser.close();
    } finally {
      stopServer(server, port);
    }
  }
}

(async () => {
  await gateInProductionMode();
  await viewerInDevelopmentMode();
  log("PASS");
})().catch((err) => {
  console.error(`[e2e] FAIL: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
