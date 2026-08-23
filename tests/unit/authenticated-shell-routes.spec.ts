import { createMemoryHistory, createRouter, type RouteLocationRaw } from 'vue-router';

vi.mock('@/router/helpers', () => ({
  getStakingNetwork: vi.fn(),
  haveAuthRequests: vi.fn(),
  haveMetaRequests: vi.fn(),
  hasSelectedWallet: vi.fn(),
  haveSignRequests: vi.fn(),
}));
vi.mock('@/extension/messaging', () => ({ keyringIsLocked: vi.fn() }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: vi.fn() }));
vi.mock('@/stores/extension', () => ({ useExtensionStore: vi.fn() }));
vi.mock('@/stores/staking', () => ({ useStakingStore: vi.fn() }));
vi.mock('@/screens/welcome/Unlock.vue', () => ({ default: {} }));
vi.mock('@/screens/welcome/Welcome.vue', () => ({ default: {} }));
vi.mock('@/screens/main/Main.vue', () => ({ default: {} }));
vi.mock('@/screens/wallet&asset/asset/Asset.vue', () => ({ default: {} }));
vi.mock('@/screens/wallet&asset/wallet/Wallet.vue', () => ({ default: {} }));
vi.mock('@/screens/accounts/AccountsLayout.vue', () => ({ default: {} }));
vi.mock('@/screens/extension-ui/DAppsAuths.vue', () => ({ default: {} }));
vi.mock('@/screens/wallet&asset/wallet/Currencies.vue', () => ({ default: {} }));

describe('authenticated shell routes', () => {
  it('keeps every primary destination and authenticated child under Main', async () => {
    const { default: routes, Components } = await import('@/router/routes');
    const router = createRouter({ history: createMemoryHistory(), routes });
    const destinations: Array<[RouteLocationRaw, string]> = [
      [{ name: Components.Currencies }, 'portfolio'],
      [{ name: Components.Nfts }, 'portfolio'],
      [{ name: Components.NftCollection, params: { chainId: '1', contract: 'collection' } }, 'portfolio'],
      [{ name: Components.NftDetails, params: { chainId: '1', contract: 'collection', id: '1' } }, 'portfolio'],
      [{ name: Components.NftSendForm, params: { chainId: '1', contract: 'collection', id: '1' } }, 'portfolio'],
      [{ name: Components.AssetNetworks, params: { assetId: 'DOT' } }, 'portfolio'],
      [{ name: Components.AssetHistory, params: { assetId: 'DOT', selectedNetwork: 'Polkadot' } }, 'portfolio'],
      [{ name: Components.SendForm, params: { assetId: 'DOT', network: 'Polkadot' } }, 'portfolio'],
      [{ name: Components.ReceiveForm, params: { assetId: 'DOT', network: 'Polkadot' } }, 'portfolio'],
      [{ name: Components.Defi }, 'defi'],
      [{ name: Components.Staking }, 'defi'],
      [{ name: Components.MyStake, params: { network: 'Polkadot' } }, 'defi'],
      [{ name: Components.Pools }, 'defi'],
      [{ name: Components.PoolDetails, params: { poolName: 'XOR-VAL' } }, 'defi'],
      [{ name: Components.Farming }, 'defi'],
      [{ name: Components.Polkamarkt, params: { marketId: '42' } }, 'defi'],
      [{ name: Components.Polkaswap }, 'polkaswap'],
      [{ name: Components.PolkaswapDisclaimer }, 'polkaswap'],
      [{ name: Components.CrossChain }, 'cross-chain'],
      [{ name: Components.CrossChainForm, params: { assetId: 'DOT', network: 'Polkadot' } }, 'cross-chain'],
      [{ name: Components.Settings }, 'settings'],
      [{ name: Components.SettingsNetworksAssets }, 'settings'],
      [{ name: Components.SettingsChangePassword }, 'settings'],
      [{ name: Components.WalletConnectInitAuth }, 'settings'],
      [{ name: Components.DAppsAuths, params: { type: 'ton' } }, 'settings'],
      [{ name: Components.WcAuths }, 'settings'],
      [{ name: Components.DAppDetails, params: { type: 'evm', id: 'app' } }, 'settings'],
      [{ name: Components.WalletConnectAuthDetails, params: { topic: 'topic' } }, 'settings'],
      [{ name: Components.AccountSetting }, 'settings'],
      [{ name: Components.ChainAccounts, params: { type: 'substrate' } }, 'settings'],
      [{ name: Components.Nodes, params: { network: 'Polkadot' } }, 'settings'],
      [{ name: Components.Export, params: { network: 'Polkadot' } }, 'settings'],
    ];

    destinations.forEach(([target, primaryNavigation]) => {
      const resolved = router.resolve(target);

      expect(resolved.matched[0]?.path, resolved.fullPath).toBe('/fearless');
      expect(resolved.meta.primaryNavigation, resolved.fullPath).toBe(primaryNavigation);
    });
  });

  it('retains redirects for released authenticated URLs', async () => {
    const { default: routes } = await import('@/router/routes');
    const router = createRouter({ history: createMemoryHistory(), routes });
    const oldPaths = [
      '/currencies',
      '/nft-collections',
      '/collection/collection',
      '/collection/collection/1',
      '/send-nft/collection/1',
      '/send/DOT/Polkadot',
      '/receive/DOT/Polkadot',
      '/cross-chain/DOT/Polkadot',
      '/my-stake/Polkadot',
      '/polkaswap-disclaimer',
      '/accounts',
      '/chain-accounts/substrate',
      '/accounts/Polkadot',
      '/accounts/Polkadot/export',
      '/wallet-connect',
      '/auth-management',
      '/dapps/ton',
      '/wc',
      '/dapp-details/evm/app',
      '/auth-management/wc-details/topic',
    ];

    oldPaths.forEach((path) => {
      expect(router.resolve(path).matched.at(-1)?.redirect, path).toBeTruthy();
    });
  });
});
