import type { MessageTypes, Port, TransportRequestMessage } from '@extension-base/background/types/types';
import { registerToolbarSurface } from '@/extension/toolbarSurface';

// The error a request receives while the wallet's stored records cannot be read. The
// popup shows its storage message for it, and its retry sends the request that reads again.
export const WALLET_STORAGE_UNAVAILABLE = 'Wallet storage could not be read.';

export interface BackgroundRuntime {
  handleMessage(data: TransportRequestMessage<MessageTypes>, port: Port): Promise<void>;
  onInstalled(details: chrome.runtime.InstalledDetails): Promise<void>;
  onAlarm(alarm: chrome.alarms.Alarm): void | Promise<void>;
}

export function registerBackgroundListeners(api: typeof chrome, ready: Promise<BackgroundRuntime>): void {
  const reportError = (error: unknown) => console.error('Background event failed', error);
  void ready.catch(reportError);
  const dispatch = (action: (runtime: BackgroundRuntime) => unknown) => {
    void ready.then(action).catch(reportError);
  };

  api.runtime.onConnect.addListener((port: Port) => {
    let disconnected = false;
    port.onDisconnect.addListener(() => { disconnected = true; });
    port.onMessage.addListener((data: TransportRequestMessage<MessageTypes>) => {
      void ready.then((runtime) => {
        if (!disconnected) return runtime.handleMessage(data, port);
      }).catch((error: unknown) => {
        if (disconnected) return;
        try {
          port.postMessage({ id: data.id, error: error instanceof Error ? error.message : 'Wallet could not initialize.' });
        } catch {
          // The sender may have closed while the runtime was loading.
        }
      });
    });
  });

  api.runtime.onInstalled.addListener((details) => dispatch((runtime) => runtime.onInstalled(details)));
  api.runtime.onUpdateAvailable.addListener(() => api.runtime.reload());
  // Creating an alarm again reschedules it, so a worker that restarts more often than the period would keep
  // postponing it. An alarm that already exists with the same period is kept.
  // When the lookup fails the alarm is created, as before.
  const keepAlarm = async (name: string, periodInMinutes: number) => {
    const alarm = await Promise.resolve().then(() => api.alarms.get(name)).catch(() => undefined);
    if (alarm?.periodInMinutes !== periodInMinutes) await api.alarms.create(name, { periodInMinutes });
  };
  keepAlarm('fearless-asset-discovery-sweep', 60).catch(reportError);
  keepAlarm('fearless-network-registry-retry', 1).catch(reportError);
  api.alarms.onAlarm.addListener((alarm) => dispatch((runtime) => runtime.onAlarm(alarm)));
  // No tab or window listeners: each event woke the worker and ran the whole start-up, but the extension build
  // ignores a request without a port (handlers), and the wallet pages read the active tab themselves.
  registerToolbarSurface(api, reportError);
}
