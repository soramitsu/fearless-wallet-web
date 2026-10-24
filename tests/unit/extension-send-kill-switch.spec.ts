import axios from 'axios';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('@/extension/messaging', () => ({}));
vi.mock('@/router', () => ({ default: { push: vi.fn() } }));
vi.mock('@/router/routes', () => ({ Components: {} }));

import { useExtensionStore } from '@/stores/extension';
import { useSendKillSwitchStore } from '@/stores/sendKillSwitch';
import { isNetworkTransferEnabled } from '@/util/releaseFeatures';

const STORAGE_KEY = 'feature_send-kill-switch-v1';
const FLAG = 'VUE_APP_ENABLE_SOLANA_TRANSFERS';
const originalFlag = process.env[FLAG];

const createLocalStorageStub = () => {
  const storage = new Map<string, string>();

  return {
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    removeItem: (key: string) => storage.delete(key),
    setItem: (key: string, value: string) => storage.set(key, value),
    get length() {
      return storage.size;
    },
  };
};

describe('popup send kill switch', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageStub());
    setActivePinia(createPinia());
    vi.mocked(axios.get).mockReset();
    delete process.env[FLAG];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = originalFlag;
  });

  it('keeps the Solana send available when the remote config says nothing', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: { fiat: { moonpay: true } } });
    const store = useExtensionStore();

    await store.fetchFeatures();

    expect(isNetworkTransferEnabled({ ecosystem: 'solana' }, useSendKillSwitchStore().vetoes)).toBe(true);
  });

  it('hides a vetoed send and keeps the veto across an offline start', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: { actions: { solanaSend: false } } });
    const store = useExtensionStore();

    await store.fetchFeatures();

    expect(isNetworkTransferEnabled({ ecosystem: 'solana' }, useSendKillSwitchStore().vetoes)).toBe(false);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).value.vetoes.solanaSend).toBe(true);

    setActivePinia(createPinia());
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('offline'));
    const restarted = useExtensionStore();

    await restarted.fetchFeatures();

    expect(isNetworkTransferEnabled({ ecosystem: 'solana' }, useSendKillSwitchStore().vetoes)).toBe(false);
    expect(isNetworkTransferEnabled({ ecosystem: 'substrate' }, useSendKillSwitchStore().vetoes)).toBe(true);
  });

  it('lifts a veto only on an explicit true', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ value: { schemaVersion: 1, updatedAt: 1, vetoes: { solanaSend: true } } })
    );
    vi.mocked(axios.get).mockResolvedValueOnce({ data: { actions: {} } });
    const store = useExtensionStore();

    await store.fetchFeatures();
    expect(useSendKillSwitchStore().vetoes.solanaSend).toBe(true);

    vi.mocked(axios.get).mockResolvedValueOnce({ data: { feature_toggle: { solana_send_enabled: true } } });
    await store.fetchFeatures();
    expect(useSendKillSwitchStore().vetoes.solanaSend).toBe(false);
  });

  it('treats an unreadable remembered state as no veto', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('offline'));
    const store = useExtensionStore();

    await store.fetchFeatures();

    expect(useSendKillSwitchStore().vetoes).toEqual({ solanaSend: false });
  });
});
