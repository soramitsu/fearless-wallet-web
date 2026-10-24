import { describe, expect, it, vi } from 'vitest';
import { registerBackgroundListeners, type BackgroundRuntime } from '@/extension/entry/backgroundBootstrap';

function event() {
  const listeners: ((...args: unknown[]) => void)[] = [];
  return { addListener: vi.fn((listener) => listeners.push(listener)), emit: (...args: unknown[]) => listeners.forEach((listener) => listener(...args)) };
}

function fixture() {
  const api = {
    runtime: { onConnect: event(), onInstalled: event(), onUpdateAvailable: event(), reload: vi.fn() },
    tabs: { onUpdated: event(), onActivated: event(), onRemoved: event() },
    windows: { onFocusChanged: event() },
    alarms: { create: vi.fn(), onAlarm: event() },
  };
  const runtime = { handleMessage: vi.fn().mockResolvedValue(undefined), onInstalled: vi.fn().mockResolvedValue(undefined), getActiveTabs: vi.fn(), onAlarm: vi.fn() };
  const port = { onMessage: event(), onDisconnect: event(), postMessage: vi.fn() };
  let resolve!: (value: BackgroundRuntime) => void;
  let reject!: (error: Error) => void;
  const ready = new Promise<BackgroundRuntime>((yes, no) => { resolve = yes; reject = no; });
  registerBackgroundListeners(api as unknown as typeof chrome, ready);
  return { api, runtime, port, resolve, reject };
}

describe('synchronous extension background wake listeners', () => {
  it('captures a cold port and every early message before runtime initialization finishes', async () => {
    const f = fixture();
    expect(f.api.runtime.onConnect.addListener).toHaveBeenCalledOnce();
    f.api.runtime.onConnect.emit(f.port);
    const first = { id: 'first', message: 'pri(onboarding.isRequired)', request: {} };
    const second = { id: 'second', message: 'pri(keyring.hasMasterPassword)', request: {} };
    f.port.onMessage.emit(first);
    f.port.onMessage.emit(second);
    expect(f.runtime.handleMessage).not.toHaveBeenCalled();
    f.resolve(f.runtime);
    await vi.waitFor(() => expect(f.runtime.handleMessage).toHaveBeenCalledTimes(2));
    expect(f.runtime.handleMessage).toHaveBeenNthCalledWith(1, first, f.port);
    expect(f.runtime.handleMessage).toHaveBeenNthCalledWith(2, second, f.port);
  });

  it('captures install, alarms and tab lifecycle events during cold startup', async () => {
    const f = fixture();
    const details = { reason: 'install' };
    const alarm = { name: 'fearless-asset-discovery-sweep' };
    f.api.runtime.onInstalled.emit(details);
    f.api.alarms.onAlarm.emit(alarm);
    f.api.tabs.onUpdated.emit(1, { status: 'complete' });
    f.api.tabs.onUpdated.emit(1, { url: 'https://fixture.example' });
    f.api.tabs.onActivated.emit({ tabId: 1 });
    f.api.tabs.onRemoved.emit(1);
    f.api.windows.onFocusChanged.emit(1);
    expect(f.runtime.onInstalled).not.toHaveBeenCalled();
    f.resolve(f.runtime);
    await vi.waitFor(() => expect(f.runtime.getActiveTabs).toHaveBeenCalledTimes(4));
    expect(f.runtime.onInstalled).toHaveBeenCalledExactlyOnceWith(details);
    expect(f.runtime.onAlarm).toHaveBeenCalledExactlyOnceWith(alarm);
    expect(f.api.alarms.create).toHaveBeenCalledWith('fearless-asset-discovery-sweep', { periodInMinutes: 60 });
  });

  it('does not execute queued requests from a window that closed during initialization', async () => {
    const f = fixture();
    f.api.runtime.onConnect.emit(f.port);
    f.port.onMessage.emit({ id: 'closed' });
    f.port.onDisconnect.emit();
    f.resolve(f.runtime);
    await Promise.resolve();
    expect(f.runtime.handleMessage).not.toHaveBeenCalled();
  });

  it('reports initialization failure to an early request instead of leaving it unresolved', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const f = fixture();
      f.api.runtime.onConnect.emit(f.port);
      f.port.onMessage.emit({ id: 'failed' });
      f.reject(new Error('Initialization failed'));
      await vi.waitFor(() => expect(f.port.postMessage).toHaveBeenCalledWith({ id: 'failed', error: 'Initialization failed' }));
      expect(f.runtime.handleMessage).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('handles an update notification synchronously while the runtime is loading', () => {
    const f = fixture();
    f.api.runtime.onUpdateAvailable.emit();
    expect(f.api.runtime.reload).toHaveBeenCalledOnce();
    f.resolve(f.runtime);
  });
});
