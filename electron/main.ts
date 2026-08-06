import { app, BrowserWindow, Menu } from "electron";
import { startServer } from "../src/index.js";
import { cancelAll } from "../src/process/registry.js";

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
