import Provider from '@walletconnect/universal-provider';
import { beforeEach, expect, it, vi } from 'vitest';
import { WalletConnectDAppService } from '@extension-base/services/wallet-connect-service/dapp';
import type State from '@extension-base/background/handlers/State';

const fixture = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock('@/consts/global', async (original) => ({ ...(await original<Record<string, unknown>>()), IS_EXTENSION: true }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: {
  runtime: { getURL: (path: string) => path, lastError: undefined },
  storage: { local: {
    get: (keys: string | string[] | null, callback?: (value: Record<string, unknown>) => void) => {
      const wanted = keys === null ? Object.keys(fixture.data) : [keys].flat();
      const value = structuredClone(Object.fromEntries(wanted.filter((key) => key in fixture.data)
        .map((key) => [key, fixture.data[key]])));
      if (!callback) return Promise.resolve(value);
      callback(value);
    },
    set: (data: Record<string, unknown>, callback?: () => void) => {
      Object.assign(fixture.data, structuredClone(data));
      callback?.();
      return Promise.resolve();
    },
  } },
} }));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));

const client = { on: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), session: { values: [] } };
const state = {
  networkService: { networkValues: [{ name: 'Public Substrate', ecosystem: 'substrate', chainId: '11'.repeat(32) }] },
  keyringService: { isResetting: false, walletResetRevision: 0, currentAccountRevision: 0, getAddresses: () => [], getAllAccounts: () => [] },
} as unknown as State;
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  fixture.data = {};
  vi.restoreAllMocks();
  vi.spyOn(Provider, 'init').mockResolvedValue({ client } as unknown as Provider);
});

it('does not start the WalletConnect provider when a worker starts with nothing stored', async () => {
  new WalletConnectDAppService(state);
  await settled();

  expect(Provider.init).not.toHaveBeenCalled();
});

it.each([['wc@2:client:0.3//session'], ['wc@2:core:0.3//pairing']])(
  'restores the stored mobile connection (%s) when a worker starts',
  async (key) => {
    fixture.data[key] = [{ topic: 'public-mobile-session' }];

    new WalletConnectDAppService(state);

    await vi.waitFor(() => expect(Provider.init).toHaveBeenCalledOnce());
  }
);

it('starts the WalletConnect provider for the first mobile pairing', async () => {
  client.connect.mockResolvedValue({ uri: 'wc:public-first-pairing', approval: () => new Promise(() => undefined) });
  const service = new WalletConnectDAppService(state);
  await settled();

  await expect(service.initPairing('public-first-attempt')).resolves.toBe('wc:public-first-pairing');
  expect(Provider.init).toHaveBeenCalledOnce();
});
