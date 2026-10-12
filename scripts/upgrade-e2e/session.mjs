// One browser profile through a scenario: the released build writes it, newer builds replace that build in place under
// the same extension id (as a Web Store update does), and the browser restarts between steps.
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  coldStartProbe,
  dumpStorage,
  inServiceWorker,
  installBuild,
  launch,
  openPopup,
  reloadExtension,
  serviceWorker,
  stop,
} from './chrome.mjs';

export class Session {
  constructor({ workDir, port, manifestKey, hostRules = [], args = [] }) {
    this.workDir = workDir;
    this.extDir = join(workDir, 'extension');
    this.profileDir = join(workDir, 'profile');
    this.port = port;
    this.manifestKey = manifestKey;
    this.hostRules = hostRules;
    this.args = args;
    this.chrome = undefined;
    this.extId = undefined;
    this.version = undefined;
    this.popups = [];
  }

  async launch() {
    this.chrome = launch({
      profileDir: this.profileDir,
      extDir: this.extDir,
      port: this.port,
      hostRules: this.hostRules,
      args: this.args,
    });
    const sw = await serviceWorker(this.port);
    const extId = new URL(sw.url).host;
    if (this.extId && extId !== this.extId) throw new Error(`the extension id changed from ${this.extId} to ${extId}`);
    this.extId = extId;
    return extId;
  }

  /** A new profile with the released build in it. */
  async startFresh(buildDir) {
    await this.stop();
    rmSync(this.workDir, { recursive: true, force: true });
    mkdirSync(this.profileDir, { recursive: true });
    this.version = installBuild(buildDir, this.extDir, this.manifestKey);
    await this.launch();
    return this.popup();
  }

  /** Replaces the running build with another one in place: same directory, same id, then a reload from
   * chrome://extensions, which starts the new service worker and fires runtime.onInstalled ("update"). */
  async replaceWith(buildDir) {
    await this.stop();
    const version = installBuild(buildDir, this.extDir, this.manifestKey);
    await this.launch();
    const reload = await reloadExtension(this.port, this.extId);
    if (reload.reload !== 'ok' || reload.version !== version)
      throw new Error(`Chrome did not switch to ${version}: ${JSON.stringify(reload)}`);
    this.version = version;
    // The new build reloads itself once after an update (backgroundRuntime.ts onInstalled); let that settle.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await serviceWorker(this.port);
    return reload;
  }

  /** Closes the browser and starts it again on the same profile and build: a new service worker. */
  async restart() {
    await this.stop();
    await this.launch();
  }

  /** A popup whose port the background answers. Right after an update the port can reach a worker that is being
   * replaced and never answers; such a popup is closed and opened again. */
  async popup(hash = '') {
    for (let attempt = 1; ; attempt++) {
      const popup = await openPopup(this.port, this.extId, hash);
      this.popups.push(popup);
      const answered = await popup
        .eval(
          `Promise.race([window.__send('pri(accounts.subscribe)').then(() => true, () => true), new Promise((done) => setTimeout(() => done(false), 20000))])`
        )
        .catch(() => false);
      if (answered || attempt === 3) return popup;
      popup.close();
      await popup.closeTarget();
      await serviceWorker(this.port);
    }
  }

  storage() {
    return dumpStorage(this.port);
  }

  inWorker(expression) {
    return inServiceWorker(this.port, expression);
  }

  /** Cold starts with the browser closed, each answering the first messages (A9). Leaves the browser closed. */
  async coldStarts(count) {
    await this.stop();
    const runs = [];
    for (let i = 0; i < count; i++) {
      const started = Date.now();
      const result = await coldStartProbe({
        profileDir: this.profileDir,
        extDir: this.extDir,
        port: this.port,
        extId: this.extId,
        hostRules: this.hostRules,
        args: this.args,
      }).catch((error) => ({ error: String(error?.stack ?? error) }));
      runs.push(result);
      console.log(
        `[cold-start ${i + 1}/${count}] ${Date.now() - started} ms${result.error ? `: ${result.error}` : ''}`
      );
    }
    return runs;
  }

  async stop() {
    for (const popup of this.popups.splice(0)) popup.close();
    await stop(this.chrome);
    this.chrome = undefined;
  }
}
