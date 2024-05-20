import type { App } from 'electron';
import { APP_NAME, AUTHOR, COPYRIGHT, AUTHOR_WEBSITE, APP_VERSION } from '@/consts/global';

export default function buildAboutPage(app: App): void {
  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: APP_VERSION,
    version: APP_VERSION,
    copyright: COPYRIGHT,
    authors: [AUTHOR],
    website: AUTHOR_WEBSITE,
  });
}
