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
 *
 *   npm run e2e            (needs `npx playwright install chromium` once)
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

    await page.goto(`${base}/`, { waitUntil: "load" });
    expectEq(await page.title(), "Isshin Ryu Katas", "title");
    await page.waitForFunction(() => document.querySelectorAll("#kata-select option").length === 5, null, { timeout: 30_000 });
    expectEq(await page.locator("#error-banner").isVisible(), false, "error banner hidden");
    await page.waitForFunction(() => ((window as unknown as { __kitAwards?: Award[] }).__kitAwards ?? []).length >= 1, null, { timeout: 30_000 });
    let a = await awards(page);
    expectEq(a[0].event, "kata_view", "first award");
    expectEq(a[0].detail.kata, "seisan", "first kata viewed");
    log("dev: viewer booted with the mock kit; kata_view for seisan");
    await lastSaveIs(page, "1 kata practised");
    log('dev: tile save "1 kata practised"');

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
