const { app, BrowserWindow, Tray, Menu, nativeImage, shell, Notification } = require('electron');
const path = require('node:path');

const CADENCE_URL = 'https://cadence-elite.vercel.app';
let mainWindow = null;
let tray = null;
let isQuitting = false;

// A desktop wrapper can allow autoplay after the user has enabled sound in Windows.
// The Cadence page still owns reminder schedules and reminder settings.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.setAppUserModelId('com.cadence.desktop');

function createTrayIcon() {
  // Use a small inline SVG for the tray icon; fall back safely if the OS cannot decode it.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#7557d9"/><path d="M5 17h4l3-8 5 15 4-11 2 4h4" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  try {
    return nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
  } catch {
    return nativeImage.createEmpty();
  }
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 900,
    minHeight: 620,
    show: true,
    autoHideMenuBar: true,
    title: 'Cadence Companion',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  mainWindow.loadURL(CADENCE_URL);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') && !url.startsWith(CADENCE_URL)) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (Notification.isSupported()) {
        new Notification({
          title: 'Cadence is still running',
          body: 'Your reminder page is staying active in the system tray.'
        }).show();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('Cadence Companion — reminders running');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Cadence', click: showWindow },
    { type: 'separator' },
    {
      label: 'Launch at Windows sign-in',
      type: 'checkbox',
      checked: Boolean(app.getLoginItemSettings().openAtLogin),
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked })
    },
    { type: 'separator' },
    {
      label: 'Quit Cadence Companion',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
  tray.on('double-click', showWindow);
  tray.on('click', showWindow);
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  // Intentionally stay alive in the tray on Windows.
});
