import type { Asset } from '@extension-base/types';
import { FPNumber } from '@/sora/number';

export function getAssetOptions(assetId: string, assetsMap: Asset[]) {
  const { currencyId, symbol, type } = assetsMap.find(({ id }) => id === assetId)!;

  if (type === 'stable') return { Stable: currencyId!.toUpperCase() };
  if (type === 'vsToken') return { VSToken: currencyId!.toUpperCase() };
  if (type === 'vToken') return { VToken: currencyId!.toUpperCase() };
  if (type === 'token2') return { Token2: currencyId };
  if (type === 'foreignAsset') return { ForeignAsset: currencyId };
  if (type === 'liquidCrowdloan') return { LiquidCrowdloan: currencyId };
  if (type === 'stableAssetPoolToken') return { StableAssetPoolToken: currencyId };
  if (type === 'soraAsset') return currencyId;
  if (type === 'equilibrium') return currencyId;
  if (type === 'assets') return currencyId;
  if (type === 'assetId') return currencyId;
  // Pendulum and Amplitude key their XCM tokens by index, which the registry gives as currencyId. As { Token: symbol }
  // their balances could not be read nor their transfers built.
  if (type === 'xcm') {
    if (!/^\d+$/.test(currencyId ?? '') || !Number.isSafeInteger(Number(currencyId))) throw new Error(`Invalid XCM asset index ${currencyId}`);

    return { XCM: Number(currencyId) };
  }

  // TODO AUSD
  if (assetId === '91a69026-0ab7-4db0-af53-8d571fd33ac4') return { Token: currencyId!.toUpperCase() };

  return { Token: symbol.toUpperCase() };
}

export function getPrecisionValue(_amount: string | undefined, precision: number): string {
  const amount = _amount === '' || _amount === undefined ? '0' : _amount;
  const amountFP = new FPNumber(amount, precision);

  return amountFP.toCodecString();
}
