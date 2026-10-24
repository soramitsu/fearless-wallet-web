import { describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ lock: vi.fn(), fees: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: {} }));
vi.mock('@/consts/global', () => ({ IS_EXTENSION: false }));
vi.mock('@/consts/networks', () => ({ ALL_NETWORKS: 'all' }));
vi.mock('@/router/routes', () => ({ Components: {} }));
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

describe('web recovery-only application startup', () => {
  it('mounts recovery without running the normal wallet initialization that requires writable state', async () => {
    const context = { setupSWPing: vi.fn(), setupWallet: vi.fn(), setupNetworks: vi.fn(), setupBalance: vi.fn(),
      setupNfts: vi.fn(), setupPrice: vi.fn(), accountsStore: { recordPortfolioLayoutFirstRun: vi.fn() },
      networksStore: { getFiats: vi.fn() }, extensionStore: { fetchFeatures: vi.fn() } };
    await (App as unknown as { created(this: typeof context): Promise<void> }).created.call(context);
    expect(context.setupSWPing).toHaveBeenCalledOnce();
    expect(context.setupWallet).not.toHaveBeenCalled();
    expect(context.setupNetworks).not.toHaveBeenCalled();
    expect(context.setupNfts).not.toHaveBeenCalled();
    expect(context.accountsStore.recordPortfolioLayoutFirstRun).not.toHaveBeenCalled();
    expect(fixture.lock).not.toHaveBeenCalled();
  });
});
