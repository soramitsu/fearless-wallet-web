import { registerSoramitsuUI } from './soramitsuUI';
import type { App } from 'vue';

export function registerPlugins(app: App) {
  registerSoramitsuUI(app);
}
