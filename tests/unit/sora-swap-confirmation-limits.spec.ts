import { describe, expect, it, vi } from 'vitest';
import { prepareSwapExecution } from '@extension-base/api/substrate/sora/swap';
import type { Asset } from '@/sora/types';
import { SoraClient, XOR, VAL } from '@/sora/client';
import { SORA_NETWORK_NAME } from '@/consts/sora';
import { validateAuthoritativePolkaswapExecution } from '@/defi/polkaswapExecutionGuard';

vi.mock('@extension-base/api/substrate', () => ({ getAssetOptions: (id: string) => id }));
vi.mock('@extension-base/api/substrate/sora', () => ({
  getSoraAsset: ({ tokenBalance }: { tokenBalance: { asset: Asset } }) => tokenBalance.asset,
}));

function fixture(output: boolean, freshAmount: string, decimals: number) {
  const assetA: Asset = { address: XOR, symbol: 'A', name: 'Asset A', decimals, isMintable: false };
  const assetB: Asset = { address: VAL, symbol: 'B', name: 'Asset B', decimals, isMintable: false };
  const client = new SoraClient();
  vi.spyOn(client.assets, 'getAssetInfo').mockImplementation(async (address) => address === XOR ? assetA : assetB);
  client.provider = { send: vi.fn(async () => ({ amount: freshAmount, route: [XOR, VAL] })) } as never;
  const swap = vi.fn<(...args: unknown[]) => unknown>(() => ({}));
  client.api = { tx: { liquidityProxy: { swap } } };
  vi.spyOn(client, 'submit').mockResolvedValue();
  const state = {
    currentAccount: { address: 'selected-account' },
    balanceService: {
      getAccountBalance: () => [assetA, assetB].map((asset) => ({
        groupId: asset.address, asset, balances: [{ id: asset.address, name: SORA_NETWORK_NAME }],
      })),
    },
    networkService: { assetsMap: [assetA, assetB].map((asset) => ({ currencyId: asset.address, symbol: asset.symbol })) },
  };
  const request = { assetAId: XOR, assetBId: VAL, amountA: '1.5', amountB: '2', isExchangeB: output, slippage: 0.5 };
  const prepare = () => prepareSwapExecution(request, client, state as never);
  return { client, swap, request, prepare };
}

describe('SORA execution retains the confirmed slippage bounds', () => {
  it.each([6, 18])('rejects a refreshed receive quote below the approved minimum at %i decimals', async (decimals) => {
    const { prepare, swap } = fixture(false, String(19n * 10n ** BigInt(decimals) / 10n), decimals);
    await expect(prepare()).rejects.toThrow('The SORA quote moved beyond your confirmed slippage');
    expect(swap).not.toHaveBeenCalled();
  });

  it.each([6, 18])('rejects a refreshed spend quote above the approved maximum at %i decimals', async (decimals) => {
    const { prepare, swap } = fixture(true, String(16n * 10n ** BigInt(decimals) / 10n), decimals);
    await expect(prepare()).rejects.toThrow('The SORA quote moved beyond your confirmed slippage');
    expect(swap).not.toHaveBeenCalled();
  });

  it.each([
    [false, '1995000', '1500000', '1990000'],
    [false, '2100000', '1500000', '1990000'],
    [false, '1990000', '1500000', '1990000'],
    [true, '1505000', '2000000', '1507500'],
    [true, '1400000', '2000000', '1507500'],
    [true, '1507500', '2000000', '1507500'],
  ] as const)('keeps the approved runtime bound after an acceptable quote: output=%s, quote=%s', async (output, fresh, desired, limit) => {
    const { client, prepare, swap } = fixture(output, fresh, 6);
    const prepared = await prepare();
    const { assetA, assetB, amountA, amountB, slippage, isExchangeB, swapDexId } = prepared.swapOptions!;
    await client.swap.execute(assetA, assetB, amountA, amountB, slippage, isExchangeB, '', swapDexId);

    expect(swap.mock.calls[0][3]).toEqual(output
      ? { WithDesiredOutput: { desiredAmountOut: desired, maxAmountIn: limit } }
      : { WithDesiredInput: { desiredAmountIn: desired, minAmountOut: limit } });
    expect(prepared.maximumSourceAmount).toBe(output ? '1.5075' : '1.5');
  });

  it.each([
    ['1510000000000000000', 'The selected SORA asset balance is insufficient.'],
    ['1517500000000000000', null],
  ])('reserves the approved maximum input plus the network fee from an XOR balance of %s', async (transferable, message) => {
    const { prepare } = fixture(true, '1500000000000000000', 18);
    const prepared = await prepare();
    const xor = { address: XOR, decimals: 18, balance: { transferable } };
    const result = validateAuthoritativePolkaswapExecution({
      source: xor,
      destination: { address: VAL, decimals: 18, balance: { transferable: '0' } },
      xor,
      sourceAddress: XOR,
      destinationAddress: VAL,
      sourceAmount: prepared.maximumSourceAmount,
      networkFee: '0.01',
    });
    expect(result?.message ?? null).toBe(message);
  });
});
