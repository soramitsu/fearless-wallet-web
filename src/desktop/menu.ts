import { Menu, MenuItem, shell } from 'electron';
import URLS from '@/consts/urls';

const isMac = process.platform === 'darwin';

const defaultTemplate = (appName: string) =>
  [
    {
      label: appName,
      submenu: [
        {
          role: 'about',
          label: 'About',
        },
        {
          type: 'separator',
        },
        {
          role: 'services',
          label: 'Services',
        },
        {
          type: 'separator',
        },
        {
          role: 'hide',
          label: `Hide ${appName}`,
        },
        {
          role: 'hideothers',
          label: 'Hide Others',
        },
        {
          role: 'unhide',
          label: 'Show All',
        },
        {
          type: 'separator',
        },
        {
          role: 'quit',
          label: `Quit ${appName}`,
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          selector: 'undo:',
        },
        {
          label: 'Redo',
          accelerator: 'Shift+CmdOrCtrl+Z',
          selector: 'redo:',
        },
        {
          type: 'separator',
        },
        {
          label: 'Cut',
          accelerator: 'CmdOrCtrl+X',
          selector: 'cut:',
        },
        {
          label: 'Copy',
          accelerator: 'CmdOrCtrl+C',
          selector: 'copy:',
        },
        {
          label: 'Paste',
          accelerator: 'CmdOrCtrl+V',
          selector: 'paste:',
        },
        {
          label: 'Select All',
          accelerator: 'CmdOrCtrl+A',
          selector: 'selectAll:',
        },
      ],
    },
    {
      role: 'help',
      label: 'Help',
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            await shell.openExternal(URLS.FEARLESS_WALLET);
          },
        },
      ],
    },
  ] as unknown as Array<MenuItem>;

export function buildMenu(appName: string) {
  const menu = Menu.buildFromTemplate(isMac ? defaultTemplate(appName) : []);
  Menu.setApplicationMenu(menu);

  return menu;
}
