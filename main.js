// main.js (ESM)
import { app, BrowserWindow, dialog } from "electron";
import { fork } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import updaterPkg from "electron-updater";
import dotenv from "dotenv";

dotenv.config(); // ✅ load .env into process.env

const { autoUpdater } = updaterPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let serverProcess;
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 2100,
    height: 900,
    icon: path.join(__dirname, "public", "assets", "moon-man-logo.ico"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadURL("http://localhost:3000");
}

// --- Auto-update wiring ---
function setupAutoUpdater() {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.sussexbeds.suitepim");
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("checking-for-update", () => {
    // mainWindow?.webContents.send("update:status", "checking");
  });
  autoUpdater.on("update-available", (info) => {
    // mainWindow?.webContents.send("update:available", info);
  });
  autoUpdater.on("update-not-available", (info) => {
    // mainWindow?.webContents.send("update:none", info);
  });
  autoUpdater.on("download-progress", (p) => {
    // mainWindow?.webContents.send("update:progress", p);
  });
  autoUpdater.on("error", (err) => {
    console.error("Updater error:", err);
  });

  autoUpdater.on("update-downloaded", async () => {
    const { response } = await dialog.showMessageBox({
      type: "question",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      message: "Update ready",
      detail: "A new version has been downloaded. Restart to apply it?",
    });
    if (response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 2000);
}

app.whenReady().then(() => {
  const logDir = path.join(app.getPath("userData"), "logs");
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

  const logFile = fs.createWriteStream(path.join(logDir, "server.log"), {
    flags: "a",
  });

  // ✅ Start server.js as a child Node process, passing env
  serverProcess = fork(path.join(__dirname, "server.js"), {
    env: {
      ...process.env, // includes GITHUB_TOKEN etc
      NODE_ENV: process.env.NODE_ENV || "production",
    },
  });

  serverProcess.stdout?.on("data", (data) => {
    const msg = data.toString();
    logFile.write(`[SERVER STDOUT] ${msg}`);
    if (process.env.NODE_ENV !== "production") {
      process.stdout.write(msg);
    }
  });

  serverProcess.stderr?.on("data", (data) => {
    const msg = data.toString();
    logFile.write(`[SERVER STDERR] ${msg}`);
    if (process.env.NODE_ENV !== "production") {
      process.stderr.write(msg);
    }
  });

  serverProcess.on("close", (code) => {
    logFile.write(`server.js exited with code ${code}\n`);
  });

  createWindow();
  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (serverProcess) serverProcess.kill();
    app.quit();
  }
});
