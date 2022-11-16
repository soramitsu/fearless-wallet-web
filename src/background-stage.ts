import { app, protocol, BrowserWindow, session } from 'electron';
import installExtension, { VUEJS_DEVTOOLS } from 'electron-devtools-installer';

import { isSafeForExternalOpen } from '@/consts/urls';
import { APP_WIDTH, APP_HEIGHT, APP_NAME } from '@/consts/global';
import { requestHandler, scheme } from '@/desktop/protocol';
import { buildMenu } from '@/desktop/menu';

const isDev = process.env.NODE_ENV !== 'production';

let win: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  // If you'd like to set up auto-updating for your app,
  // I'd recommend looking at https://github.com/iffy/electron-updater-example
  // to use the method most suitable for you.
  // eg. autoUpdater.checkForUpdatesAndNotify();
  console.info('createWindow');

  if (!isDev) {
    // Needs to happen before creating/loading the browser window;
    // protocol is only used in prod
    protocol.registerBufferProtocol(scheme, requestHandler);
  }

  console.info('protocol REGISTERED');

  // Create the browser window.
  win = new BrowserWindow({
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
    webPreferences: {
      devTools: isDev, // maybe it should be disabled
      nodeIntegration: true,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: false,
      disableBlinkFeatures: 'Auxclick',
    },
  });

  buildMenu(APP_NAME);

  if (isDev && process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    win.loadURL(process.env.WEBPACK_DEV_SERVER_URL as string);
    if (!process.env.IS_TEST) win.webContents.openDevTools({ mode: 'undocked' });
  } else {
    console.info('START LOADING');
    win.loadURL(`${scheme}://./index.html`);
  }

  win.webContents.on('did-finish-load', () => {
    console.info('LOADED!');
    win?.setTitle(APP_NAME);
  });

  win.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    win?.setTitle(errorDescription);
    console.warn(errorCode, errorDescription, validatedURL);
  });

  // Only do these things when in development
  if (isDev) {
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

  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    console.info('CLOSED');
    win = null;
  });

  // https://electronjs.org/docs/tutorial/security#4-handle-session-permission-requests-from-remote-content
  const ses = session;
  const partition = 'default';
  ses
    .fromPartition(partition) /* eng-disable PERMISSION_REQUEST_HANDLER_JS_CHECK */
    .setPermissionRequestHandler((webContents, permission, permCallback) => {
      const allowedPermissions: Array<string> = []; // Full list here: https://developer.chrome.com/extensions/declare_permissions#manifest

      if (allowedPermissions.includes(permission)) {
        permCallback(true); // Approve permission request
      } else {
        console.error(
          `The application tried to request permission for '${permission}'. This permission was not whitelisted and has been blocked.`
        );

        permCallback(false); // Deny
      }
    });
}

// Needs to be called before app is ready;
// gives our scheme access to load relative files,
// as well as local storage, cookies, etc.
// https://electronjs.org/docs/api/protocol#protocolregisterschemesasprivilegedcustomschemes
protocol.registerSchemesAsPrivileged([
  {
    scheme,
    privileges: {
      standard: true,
      secure: true,
    },
  },
]);

app.setAboutPanelOptions({
  applicationName: APP_NAME,
  applicationVersion: '1.0.0',
  version: '1.0.0',
  copyright: 'Copyright 2021-2023',
  authors: ['Soramitsu'],
  website: 'https://soramitsu.co.jp',
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow();
  }
});

app.on('web-contents-created', (event, contents) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    // Strip away preload scripts if unused or verify their location is legitimate
    delete webPreferences.preload;
    // Disable Node.js integration
    // webPreferences.nodeIntegration = false;
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  contents.on('will-redirect', (event, navigationUrl) => {
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
    if (!isSafeForExternalOpen(url)) {
      console.error(
        `The application tried to open a new window at the following address: '${url}'. This attempt was blocked.`
      );

      return { action: 'deny' };
    }

    return { action: 'allow' };
  });
});

// Exit cleanly on request from parent process in development mode.
if (isDev) {
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
