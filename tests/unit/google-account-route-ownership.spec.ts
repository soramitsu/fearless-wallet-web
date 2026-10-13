import { describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ lock: vi.fn(), fees: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: {} }));
vi.mock('@/consts/global', () => ({ IS_EXTENSION: false }));
vi.mock('@/consts/networks', () => ({ ALL_NETWORKS: 'all' }));
vi.mock('@/router/routes', () => ({ Components: { AddWallet: 'AddWallet', AddFromGoogle: 'AddFromGoogle', CreateGoogle: 'CreateGoogle', Wallet: 'Wallet' } }));
vi.mock('@/helpers/only-web', () => ({ setTitle: vi.fn() }));
vi.mock('@/stores/extension', () => ({ useExtensionStore: vi.fn() }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: vi.fn() }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: vi.fn() }));
vi.mock('@/extension/messaging/nfts', () => ({ getNftSubscribe: vi.fn() }));
vi.mock('@/extension/messaging/popup', () => ({ getPopupIds: vi.fn() }));
vi.mock('@/extension/messaging', () => ({
  getAccessStatus: async () => ({ storageRecoveryOnly: true }), lockExtension: fixture.lock,
  soraFeesSubscribe: fixture.fees, pingServiceWorker: vi.fn(), subscribeAccounts: vi.fn(),
  subscribeBalance: vi.fn(), subscribeNetworkMap: vi.fn(), subscribePrice: vi.fn(), subscribeSelectedNetworks: vi.fn(),
}));
import App from '@/App.vue';

describe('account updates during Google backup flows', () => {
  const runUpdate = (routeName: string) => {
    const context = { accountsStore: { selectedWallet: { address: 'old-public-wallet' }, setAccounts: vi.fn(), setSelectedWallet: vi.fn(), setSelectedNetwork: vi.fn() },
      $route: { name: routeName }, $router: { push: vi.fn().mockResolvedValue(undefined) } };
    const selected = { address: 'new-public-wallet', active: true, network: 'all' };
    (App as unknown as { methods: { onAccountUpdate(this: typeof context, accounts: typeof selected[]): void } }).methods.onAccountUpdate.call(context, [selected]);
    return { context, selected };
  };

  it.each(['AddFromGoogle', 'CreateGoogle', 'AddWallet'])('keeps %s open to publish its own acknowledged result', (route) => {
    const { context, selected } = runUpdate(route);
    expect(context.$router.push).not.toHaveBeenCalled();
    expect(context.accountsStore.setSelectedWallet).toHaveBeenCalledExactlyOnceWith(selected);
  });

  it('clears any inherited OAuth token when a normal account switch opens the wallet', () => {
    const { context } = runUpdate('AccountSetting');
    expect(context.$router.push).toHaveBeenCalledExactlyOnceWith({ name: 'Wallet', params: { access_token: '' } });
  });
});
