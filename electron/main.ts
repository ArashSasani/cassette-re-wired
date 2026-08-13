import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, Menu } from "electron";
import { startServer } from "../src/index.js";
import { cancelAll } from "../src/process/registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// macOS packages the app icon via icon.icns; this file only matters for the
// window/taskbar icon on Windows and Linux, and during `electron:dev`.
const appIconPath = path.join(__dirname, "../../build/icon.png");

const EXE_SUFFIX = process.platform === "win32" ? ".exe" : "";

// A packaged build bundles ffmpeg/ffprobe, a standalone Python install, and both
// models' weights under resourcesPath (electron-builder extraResources), so the app
// runs fully standalone — no host-installed ffmpeg, no user-created venv, no
// network/git/git-lfs at runtime. scripts/build-python-venv.mjs does the actual
// weight prefetching + patching at build time (see its module comment for why).
// electron:dev leaves all of this untouched: app.isPackaged is false, so config.ts
// falls back to its own dev-time defaults (ffmpeg-static/ffprobe-static,
// ~/.cassette-rewired/.venv, DeepFilterNet's own network fetch + cache).
if (app.isPackaged) {
  process.env.CASSETTE_PACKAGED = "1";
  process.env.CASSETTE_FFMPEG ??= path.join(process.resourcesPath, "bin", `ffmpeg${EXE_SUFFIX}`);
  process.env.CASSETTE_FFPROBE ??= path.join(process.resourcesPath, "bin", `ffprobe${EXE_SUFFIX}`);
  process.env.CASSETTE_PYTHON_HOME ??= path.join(process.resourcesPath, "python");
  process.env.CASSETTE_DEEPFILTER_MODEL_DIR ??= path.join(process.resourcesPath, "models", "DeepFilterNet3");
}

// Set by `electron:dev` so the window points at Vite's dev server (HMR) instead
// of the built renderer bundle Express serves in production.
const devServerUrl = process.env.CASSETTE_ELECTRON_DEV_URL;

let mainWindow: BrowserWindow | null = null;
let serverUrlPromise: Promise<string> | null = null;

// The Express server binds once per app launch; re-activating (macOS dock
// click after all windows close) must reuse it rather than re-listen on the
// same port.
function ensureServer(): Promise<string> {
  if (!serverUrlPromise) {
    serverUrlPromise = startServer().then(({ url }) => url);
  }
  return serverUrlPromise;
}

async function createWindow(): Promise<void> {
  const url = await ensureServer();

  mainWindow = new BrowserWindow({
    width: 900,
    height: 1000,
    title: "cassette re-wired",
    icon: appIconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await mainWindow.loadURL(devServerUrl ?? url);
}

const isMac = process.platform === "darwin";
Menu.setApplicationMenu(
  Menu.buildFromTemplate([
    ...(isMac ? [{ role: "appMenu" as const }] : []),
    {
      label: "File",
      submenu: [isMac ? { role: "close" as const } : { role: "quit" as const }],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ]),
);

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (!isMac) app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

// Runs last tens of minutes — never leave ffmpeg/python processes orphaned
// when the app quits.
app.on("before-quit", () => {
  cancelAll();
});
