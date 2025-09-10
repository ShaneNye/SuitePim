// main.js (ESM)
import { app, BrowserWindow, dialog } from "electron";
import { fork } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import updaterPkg from "electron-updater";
const { autoUpdater } = updaterPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let serverProcess;
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 2100,
    height: 900,
    webPreferences: {
      nodeIntegration: false, // keep secure
      contextIsolation: true,
      // If you later add preload for IPC progress UI:
      // preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadURL("http://localhost:3000");
}

// --- Auto-update wiring ---
function setupAutoUpdater() {
  // Recommended on Windows so notifications & identity work correctly
  if (process.platform === "win32") {
    app.setAppUserModelId("com.sussexbeds.suitepim"); // match build.appId later
  }

  // Sensible defaults
  autoUpdater.autoDownload = true;           // download in background
  autoUpdater.autoInstallOnAppQuit = true;   // install when the app quits
  autoUpdater.allowPrerelease = false;       // flip to true for beta channels

  // Optional: forward basic events (hook into your UI if you want)
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
    // mainWindow?.webContents.send("update:progress", p); // p.percent, p.bytesPerSecond
  });

  autoUpdater.on("error", (err) => {
    // You can log or surface this if helpful
    // mainWindow?.webContents.send("update:error", String(err));
  });

  autoUpdater.on("update-downloaded", async (info) => {
    // Prompt the user to restart now (you can also do silent install on quit)
    const { response } = await dialog.showMessageBox({
      type: "question",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      message: "Update ready",
      detail:
        "A new version has been downloaded. Restart to apply it?",
    });
    if (response === 0) {
      autoUpdater.quitAndInstall(); // Restarts the app and installs the update
    }
  });

  // Kick off the check a moment after ready so the window is already showing
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 2000);
}
// --- end updater wiring ---

app.whenReady().then(() => {
  // Ensure logs directory exists
const logDir = path.join(app.getPath("userData"), "logs");
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

  const logFile = fs.createWriteStream(path.join(logDir, "server.log"), {
    flags: "a", // append
  });

  // ✅ Start server.js as a child Node process
  serverProcess = fork(path.join(__dirname, "server.js"));

  // Pipe logs to file
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
  setupAutoUpdater(); // ⬅️ start auto-update lifecycle

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
