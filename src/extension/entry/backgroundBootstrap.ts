import type { MessageTypes, Port, TransportRequestMessage } from '@extension-base/background/types/types';

export interface BackgroundRuntime {
  handleMessage(data: TransportRequestMessage<MessageTypes>, port: Port): Promise<void>;
  onInstalled(details: chrome.runtime.InstalledDetails): Promise<void>;
  getActiveTabs(): void;
  onAlarm(alarm: chrome.alarms.Alarm): void;
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
  api.alarms.create('fearless-asset-discovery-sweep', { periodInMinutes: 60 });
  api.alarms.onAlarm.addListener((alarm) => dispatch((runtime) => runtime.onAlarm(alarm)));
  api.tabs.onUpdated.addListener((_, changeInfo) => {
    if (changeInfo.url) dispatch((runtime) => runtime.getActiveTabs());
  });
  api.windows.onFocusChanged.addListener(() => dispatch((runtime) => runtime.getActiveTabs()));
  api.tabs.onActivated.addListener(() => dispatch((runtime) => runtime.getActiveTabs()));
  api.tabs.onRemoved.addListener(() => dispatch((runtime) => runtime.getActiveTabs()));
}
