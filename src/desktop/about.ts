import pkg from '../../package.json';
import type { App } from 'electron';
import { APP_NAME, AUTHOR, COPYRIGHT, AUTHOR_WEBSITE } from '@/consts/global';

export default function buildAboutPage(app: App): void {
  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: pkg.version,
    version: pkg.version,
    copyright: COPYRIGHT,
    authors: [AUTHOR],
    website: AUTHOR_WEBSITE,
  });
}
