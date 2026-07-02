# Deploying the Kata Viewer to Hostinger

The app is a pure static site — no server code, no database, no build step.
Deploying means copying the contents of this `kata-viewer/` folder to your web space.

## Option A — hPanel File Manager (easiest)

1. Log in to [hpanel.hostinger.com](https://hpanel.hostinger.com).
2. Open your hosting plan → **File Manager**.
3. Navigate to `public_html/`.
   - To serve the viewer at your domain root (`https://yourdomain.com/`), upload into `public_html/` directly.
   - To serve it at a sub-path (`https://yourdomain.com/katas/`), create a folder `public_html/katas/` and upload into that. All paths in the app are relative, so any folder works.
4. Upload **the contents of `kata-viewer/`** (not the folder itself, unless you want the sub-path):
   - `index.html`
   - `css/` (folder)
   - `js/` (folder)
   - `data/` (folder)
   - `lib/` (folder)
   - Tip: zip the contents locally, upload the zip, then use File Manager's **Extract**.
5. Visit your domain. Done.

## Option B — FTP (FileZilla etc.)

1. In hPanel → **Files → FTP Accounts**, note the FTP host, username, and port (21).
2. Connect with your FTP client and upload the same files/folders as above into `public_html/`.

## Requirements & notes

- No PHP, Node, or database needed. Any Hostinger plan that serves static files works.
- Everything is self-contained (Three.js is bundled in `lib/`); no external CDN calls,
  so the site also works offline once loaded.
- The coach voice uses the visitor's own browser speech synthesis (Web Speech API) —
  nothing to configure server-side. Voice quality varies by browser/OS.
- HTTPS: use Hostinger's free SSL (hPanel → Security → SSL) — some browsers restrict
  speech synthesis on insecure origins.

## Testing locally before upload

From the repo root:

```powershell
.\serve.ps1
```

Then open http://localhost:8420 — this is exactly what Hostinger will serve.

## Shareable links

The viewer accepts URL parameters, which work on the deployed site too:

`?kata=chinto&t=30&cam=side&bunkai=1&play=1`

- `kata` — seisan | seiunchin | naihanchi | wansu | chinto
- `t` — start time in seconds on the kata timeline
- `cam` — front | side | rear | overhead
- `bunkai=1` — bunkai attacker on
- `play=1` — start playing immediately
