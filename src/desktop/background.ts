import path from 'path';
import { app, protocol, BrowserWindow, shell } from 'electron';
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib';
import installExtension, { VUEJS_DEVTOOLS } from 'electron-devtools-installer';
import { isSafeForExternalOpen } from '@/consts/urls';
import { APP_WIDTH, APP_HEIGHT, APP_NAME } from '@/consts/global';
import buildMenu from '@/desktop/menu';
import buildAboutPage from '@/desktop/about';

const isDevelopment = process.env.NODE_ENV !== 'production';

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { secure: true, standard: true },
  },
]);
// About page details
buildAboutPage(app);

async function createWindow(): Promise<void> {
  // Create the browser window.
  const nodeIntegration = !!process.env.ELECTRON_NODE_INTEGRATION;
  const win = new BrowserWindow({
    width: APP_WIDTH,
    height: APP_HEIGHT,
    minWidth: APP_WIDTH,
    minHeight: APP_HEIGHT,
    maxWidth: APP_WIDTH,
    maxHeight: APP_HEIGHT,
    resizable: true, // To have an ability to make full screen mode
    useContentSize: true, // To set app size = APP_HEIGHT (it includes frame height)
    frame: true,
    acceptFirstMouse: true,
    center: true,
    title: 'Loading...',
    show: false, // Small trick to show a window ONLY after the page is ready
    webPreferences: {
      // Use pluginOptions.nodeIntegration, leave this alone
      // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration for more info
      nodeIntegration,
      contextIsolation: !nodeIntegration,
      sandbox: !nodeIntegration,
      disableBlinkFeatures: 'Auxclick',
    },
  });

  win.once('ready-to-show', () => {
    // Small trick to show a window ONLY after the page is ready
    win.show();
  });

  buildMenu(APP_NAME);

  if (isDevelopment && process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    win.loadURL(process.env.WEBPACK_DEV_SERVER_URL as string);
    if (!process.env.IS_TEST) win.webContents.openDevTools({ mode: 'undocked' });
  } else {
    // Load the index.html when not in development
    win.loadFile('index.html');
  }

  win.webContents.on('did-finish-load', () => {
    win.setTitle(APP_NAME);
  });

  win.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    console.error(errorCode, errorDescription, validatedURL);
  });

  // Only do these things when in development
  if (isDevelopment) {
    // Errors are thrown if the dev tools are opened
    // before the DOM is ready
    win.webContents.once('dom-ready', async () => {
      await installExtension(VUEJS_DEVTOOLS)
        .then((name) => console.info(`Added Extension: ${name}`))
        .catch((err) => console.warn('An error occurred: ', err))
        .finally(() => {
          require('electron-debug')(); // https://github.com/sindresorhus/electron-debug
        });
    });
  }
}

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('web-contents-created', (event, contents) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    // Strip away preload scripts if unused or verify their location is legitimate
    delete webPreferences.preload;
    // Disable Node.js integration
    webPreferences.nodeIntegration = false;
    // Verify URL being loaded, FOR EXAMPLE
    // if (!params.src.startsWith('SOME_URL')) {
    //   event.preventDefault();
    // }
    event.preventDefault(); // Since we don't need webviews, all attached webviews will be disabled
  });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  contents.on('will-navigate', (event, navigationUrl) => {
    // Limit navigation, FOR EXAMPLE
    // const parsedUrl = new URL(navigationUrl);
    // if (parsedUrl.origin !== 'SOME_URL') {
    //   event.preventDefault();
    // }
    event.preventDefault(); // Since we don't have navigation, we'll prevent all
  });
  contents.setWindowOpenHandler(({ url }) => {
    // In this example, we'll ask the operating system
    // to open this event's url in the default browser.
    //
    // See the following item for considerations regarding what
    // URLs should be allowed through to shell.openExternal.
    if (isSafeForExternalOpen(url)) {
      setImmediate(() => {
        shell.openExternal(url);
      });
    }

    return { action: 'deny' };
  });
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);
app.on('open-url', (event, url) => {
  console.log('Welcome Back', `You arrived from: ${url}`);
});

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', (data) => {
      if (data === 'graceful-exit') {
        app.quit();
      }
    });
  } else {
    process.on('SIGTERM', () => {
      app.quit();
    });
  }
}
