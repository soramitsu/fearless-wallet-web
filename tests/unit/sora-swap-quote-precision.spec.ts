import { describe, expect, it, vi } from 'vitest';
import { createSwap } from '@extension-base/api/substrate/sora/swap';
import type { Asset } from '@/sora/types';
import { SoraClient, XOR, VAL } from '@/sora/client';
import { SORA_NETWORK_NAME } from '@/consts/sora';

vi.mock('@extension-base/api/substrate', () => ({ getAssetOptions: (id: string) => id }));
vi.mock('@extension-base/api/substrate/sora', () => ({
  getSoraAsset: ({ tokenBalance }: { tokenBalance: { asset: Asset } }) => tokenBalance.asset,
}));

function fixture(decimalsA: number, decimalsB: number, quoteA: string, quoteB: string) {
  const assetA: Asset = { address: XOR, symbol: 'A', name: 'Asset A', decimals: decimalsA, isMintable: false };
  const assetB: Asset = { address: VAL, symbol: 'B', name: 'Asset B', decimals: decimalsB, isMintable: false };
  const client = new SoraClient();
  vi.spyOn(client.assets, 'getAssetInfo').mockImplementation(async (address) => address === XOR ? assetA : assetB);
  const send = vi.fn(async (_method: string, params: unknown[]) => ({
    amount: params[0] === 0 ? quoteA : quoteB,
    route: [XOR, VAL],
  }));
  client.provider = { send } as never;
  const state = {
    currentAccount: { address: 'selected-account' },
    balanceService: {
      getAccountBalance: () => [assetA, assetB].map((asset) => ({
        groupId: asset.address,
        asset,
        balances: [{ id: asset.address, name: SORA_NETWORK_NAME }],
      })),
    },
    networkService: {
      assetsMap: [assetA, assetB].map((asset) => ({ currencyId: asset.address, symbol: asset.symbol })),
    },
  };
  return { client, state, send };
}

describe('SORA swap quote limits use the asset scale shown in confirmation', () => {
  it.each([6, 8, 18])('shows the minimum receive amount for a %i-decimal output asset', async (decimals) => {
    const unit = 10n ** BigInt(decimals);
    const { client, state, send } = fixture(18, decimals, String(2n * unit), String(19n * unit / 10n));
    const quote = await createSwap({
      assetAId: XOR, assetBId: VAL, amountA: '1', isExchangeB: false, slippage: 0.5,
    }, client, state as never);

    expect(quote.amountA).toBe('1');
    expect(quote.amountB).toBe('2');
    expect(quote.minMaxValue).toBe('1.99');
    expect(quote.swapOptions.swapDexId).toBe(0);
    expect(quote.route).toBe('A > B');
    expect(send.mock.calls[0][1][3]).toBe('1000000000000000000');
  });

  it.each([6, 8, 18])('shows the maximum spend amount for a %i-decimal input asset', async (decimals) => {
    const unit = 10n ** BigInt(decimals);
    const { client, state, send } = fixture(decimals, 18, String(15n * unit / 10n), String(16n * unit / 10n));
    const quote = await createSwap({
      assetAId: XOR, assetBId: VAL, amountB: '2', isExchangeB: true, slippage: 0.5,
    }, client, state as never);

    expect(quote.amountA).toBe('1.5');
    expect(quote.amountB).toBe('2');
    expect(quote.minMaxValue).toBe('1.5075');
    expect(quote.swapOptions.swapDexId).toBe(0);
    expect(quote.route).toBe('A > B');
    expect(send.mock.calls[0][1][3]).toBe('2000000000000000000');
  });

  it('shows whole-token minimums for an indivisible output asset', async () => {
    const { client, state } = fixture(18, 0, '200', '190');
    const quote = await createSwap({
      assetAId: XOR, assetBId: VAL, amountA: '1', isExchangeB: false, slippage: 0.5,
    }, client, state as never);

    expect(quote.amountB).toBe('200');
    expect(quote.minMaxValue).toBe('199');
  });

  it('shows whole-token maximums for an indivisible input asset', async () => {
    const { client, state } = fixture(0, 18, '200', '210');
    const quote = await createSwap({
      assetAId: XOR, assetBId: VAL, amountB: '2', isExchangeB: true, slippage: 0.5,
    }, client, state as never);

    expect(quote.amountA).toBe('200');
    expect(quote.minMaxValue).toBe('201');
  });
});
