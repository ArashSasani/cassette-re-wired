# ADR 0001 — Local web app, wrapped in Electron

Status: Accepted

## Context

We need a GUI for a single-user local tool: pick an MP3, clip a sample, run the
pipeline, A/B the result, show progress, export. It also needs to end up as a
double-clickable app on macOS and Windows, not something started from a terminal.
Candidates: Electron, Tauri, a local web app with no shell, or no GUI at all.

## Decision

A **Node/TS Express server plus a single HTML page**, with **Electron as the shell**
around it: `electron/main.ts` starts the same server in-process and opens a
`BrowserWindow` pointing at `http://127.0.0.1:<port>`. No IPC, no `contextBridge`, no
main/renderer split — the page is the same one the server would serve to a plain
browser, talking to the same JSON API over `fetch()`. This keeps the server itself
framework-agnostic: it can be run standalone (`npm run dev`/`npm start`) for
development, or launched inside Electron (`npm run electron:dev`) for the packaged
app, without maintaining two different frontends.

## Consequences

- **Electron adds no architectural complexity** because it isn't handed any logic to
  own. The server does the work; Electron just supplies a window and a Quit menu.
  Anything that can be tested against the Express API in isolation (which is most of
  this app) doesn't need Electron in the loop at all.
- **No real file paths.** The browser hands over bytes, not a path, so the source is
  POSTed to our own server (~60–130MB for a 90-min MP3, a second or two locally).
  This is not a real loss — the source gets copied into a per-run directory anyway so
  the original is never touched. See ADR 0003.
- Bind explicitly to `127.0.0.1`, never `0.0.0.0`, even though nothing outside the
  Electron window will ever connect to it — this is still a single-user local tool.
- **Windows is a supported build target alongside macOS.** Two platform assumptions
  had to be made explicit in `src/config.ts`: Python venv layout (`bin/` on POSIX vs.
  `Scripts/` with a `.exe` suffix on Windows) and device selection (`mps` is
  Apple-Silicon-only; `cuda` is the Windows/NVIDIA equivalent, alongside `cpu` and
  `auto`).
- **Quit must not orphan subprocesses.** Runs last tens of minutes, so `before-quit`
  cancels every tracked `ffmpeg`/Python process (`cancelAll()` in
  `src/process/registry.ts`), not just per-run `cancel`.
- Packaging is `electron-builder`, producing a `dmg` on macOS and an `nsis` installer
  on Windows via the `build` key in `package.json`. Builds are unsigned for now —
  same trust model as running from source; code signing/notarization is out of scope.

## Rejected

- **Tauri** — adds Rust while still shelling out to the same CLIs. New language,
  identical architecture, no simplicity gain.
- **Plain CLI + any media player** — the honest zero-UI baseline. It loses exactly
  one thing, *synchronised* A/B scrubbing, and that one thing is the GUI's sole
  justification.
- **A separate web-only mode with no Electron path** — would mean two frontends to
  keep in sync (a bare Express static server and an Electron-specific one) for no
  benefit, since Electron doesn't require anything the plain server doesn't already do.
