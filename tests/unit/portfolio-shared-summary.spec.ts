import { createPinia, setActivePinia } from 'pinia';
import { effectScope } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountJson, TokenGroup } from '@extension-base/background/types/types';
import { usePortfolio } from '@/portfolio/usePortfolio';
import { useAccountsStore } from '@/stores/accounts';

const spies = vi.hoisted(() => ({ summarizePortfolio: vi.fn() }));
vi.mock('@/portfolio/assetIdentity', async (original) => {
  const actual = await original<typeof import('@/portfolio/assetIdentity')>();
  spies.summarizePortfolio.mockImplementation(actual.summarizePortfolio);

  return { ...actual, summarizePortfolio: spies.summarizePortfolio };
});
vi.mock('@extension-base/stores/Storage', () => ({ storage: { get: vi.fn(), set: vi.fn() } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/extension/messaging', () => ({ getHistory: vi.fn(), toggleFavoriteNetwork: vi.fn(), sendMessage: vi.fn() }));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));
vi.mock('@/extension/messaging/asset-discovery', () => ({ forceAssetDiscoverySweep: vi.fn() }));
vi.mock('@/extension/messaging/nfts', () => ({ fetchNfts: vi.fn() }));

beforeEach(() => {
  setActivePinia(createPinia());
  spies.summarizePortfolio.mockClear();
  useAccountsStore().setSelectedWallet({ address: 'public-wallet', ethereumAddress: '', name: 'Public' } as AccountJson);
});

describe('portfolio shared by the screens that show it', () => {
  it('is one portfolio for every screen open at once, released with the last of them', () => {
    const wallet = effectScope();
    const list = effectScope();
    const first = wallet.run(() => usePortfolio())!;

    expect(list.run(() => usePortfolio())).toBe(first);

    wallet.stop();
    expect(list.run(() => usePortfolio())).toBe(first);
    list.stop();

    const reopened = effectScope();
    expect(reopened.run(() => usePortfolio())).not.toBe(first);
    reopened.stop();
  });

  // Each screen used to rebuild the same summary on every balance, price or network update.
  it('builds the summary once per update however many screens read it', () => {
    const screens = [effectScope(), effectScope(), effectScope()];
    const portfolios = screens.map((screen) => screen.run(() => usePortfolio())!);

    portfolios.forEach(({ summary }) => summary.value);
    expect(spies.summarizePortfolio).toHaveBeenCalledOnce();

    useAccountsStore().setBalance({ details: [] as TokenGroup[] });
    portfolios.forEach(({ summary }) => summary.value);
    expect(spies.summarizePortfolio).toHaveBeenCalledTimes(2);

    screens.forEach((screen) => screen.stop());
  });

  it('starts again with a new store, as a new popup does', () => {
    const scope = effectScope();
    const first = scope.run(() => usePortfolio())!;

    setActivePinia(createPinia());
    useAccountsStore().setSelectedWallet({ address: 'public-wallet', ethereumAddress: '', name: 'Public' } as AccountJson);
    const next = effectScope();

    expect(next.run(() => usePortfolio())).not.toBe(first);
    scope.stop();
    next.stop();
  });
});
