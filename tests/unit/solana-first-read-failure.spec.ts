import { describe, expect, it, vi } from 'vitest';
import { APIItemState } from '@extension-base/api/types/networks';
import SolanaBalanceService from '@extension-base/services/balance-service/SolanaBalanceService';
import { getMockAssets } from '@extension-base/background/helpers/assets';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { buildPortfolioSummary } from '@/portfolio/assetIdentity';
import { mergeUniversalWalletRegistryNetworks } from '@/util/universalWalletRegistryNetworks';

const ADDRESS = 'solana-wallet';
const SOLANA_ADDRESS = '11111111111111111111111111111111';

describe('the first Solana balance read of a wallet', () => {
  it('leaves SOL unknown and counted as unavailable when it fails, never a 0 balance', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const networkMap: Record<string, NetworkJson> = {};
    mergeUniversalWalletRegistryNetworks(networkMap, undefined);
    const solana = Object.values(networkMap).find(({ ecosystem, name }) => ecosystem === 'solana' && !/dev/i.test(name))!;
    const sol = solana.assets.find(({ isUtility, isNative }) => isUtility || isNative)!;
    // The placeholders a wallet starts with: nothing loaded, no load time.
    const balanceMap = { [ADDRESS]: getMockAssets({ [solana.name]: solana }, WalletEcosystem.Solana) };
    const updateBalanceStore = vi.fn();
    const state = {
      networkService: { activeNetworkByEcosystem: { solana: [solana] }, networkMap },
      balanceService: { balanceMap, updateBalanceStore, publishBalance: vi.fn() },
      timeoutService: { lazyNext: vi.fn() },
    } as unknown as State;
    const client = { getBalances: vi.fn().mockRejectedValue(new Error('solana_rpc_http_429')) };

    const result = await new SolanaBalanceService(state, client).fetchBalance({
      address: ADDRESS,
      solanaAddress: SOLANA_ADDRESS,
      networks: [solana.name],
    });

    // The header total says one balance is missing from it.
    const summary = buildPortfolioSummary({
      groups: balanceMap[ADDRESS],
      networks: [solana],
      prices: { [sol.priceId!]: 150 },
      priceChanges: {},
      addressForNetwork: () => SOLANA_ADDRESS,
    });
    expect(summary).toMatchObject({ unavailableCount: 1 });
    const row = balanceMap[ADDRESS].flatMap(({ balances }) => balances).find(({ id }) => id === sol.id)!;
    expect(row.state).toBe(APIItemState.ERROR);
    expect([row.total, row.free, row.transferable, row.timestamp]).toEqual([undefined, undefined, undefined, undefined]);
    expect(updateBalanceStore).toHaveBeenCalledWith(
      solana.name,
      expect.objectContaining({ id: sol.id, state: APIItemState.ERROR, total: undefined }),
      ADDRESS
    );
    expect(result).toEqual([]);
  });
});
