import { FPNumber } from '@sora-substrate/math';
import { state } from '@extension-base/background/handlers';

export function getAssetOptions(assetId: string) {
  const { currencyId, symbol, type } = state.assetsMap.find(({ id }) => id === assetId)!;

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

  // TODO
  if (type === 'assetId') return currencyId;

  return { Token: symbol.toUpperCase() };
}

export function getPrecisionValue(_amount: string | undefined, precision: number): string {
  const amount = _amount === '' || _amount === undefined ? '0' : _amount;
  const amountFP = new FPNumber(amount, precision);

  return amountFP.toCodecString();
}
