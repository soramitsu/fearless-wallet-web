import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareWebWorker, startWallet } from '@/bootstrap/startup';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('wallet startup recovery', () => {
  it('waits for preparation and routing before removing the loading surface', async () => {
    const calls: string[] = [];
    await startWallet(
      async () => ({
        mountApplication: async () => {
          calls.push('mount');
        },
      }),
      async () => {
        calls.push('prepare');
      }
    );
    expect(calls).toEqual(['prepare', 'mount']);
    expect(document.querySelector('[data-testid="walletStartup"]')).toBeNull();
  });
  it('shows a reachable retry action when dependency loading fails', async () => {
    await startWallet(() => Promise.reject(new Error('module unavailable')));
    const surface = document.querySelector('[role="alert"]');
    expect(surface?.textContent).toContain('could not start');
    const retry = surface?.querySelector('button');
    expect(retry?.hidden).toBe(false);
    expect(document.activeElement).toBe(retry);
  });
  it('times out initialization and does not mount a late application', async () => {
    vi.useFakeTimers();
    const mount = vi.fn().mockResolvedValue(undefined);
    let finish!: () => void;
    const prepare = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const pending = startWallet(
      async () => ({ mountApplication: mount }),
      () => prepare
    );
    await vi.advanceTimersByTimeAsync(20000);
    await pending;
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(mount).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"] button')).not.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('registers the web background as a module before waiting for it', async () => {
    const register = vi.fn().mockResolvedValue({});
    vi.stubGlobal('navigator', { language: 'en', serviceWorker: { register, ready: Promise.resolve({}), addEventListener: vi.fn() } });
    await prepareWebWorker();
    expect(register).toHaveBeenCalledWith(expect.any(String), { type: 'module' });
  });
});
