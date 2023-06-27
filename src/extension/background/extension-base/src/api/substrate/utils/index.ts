import { assetFromToken } from '@equilab/api';
import { FPNumber } from '@sora-substrate/math';
import { state } from '@extension-base/background/handlers';
import type { TokenBalance } from '@extension-base/background/types/types';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import type { AssetsType } from '@/interfaces';

type ExtrinsicTransferProps = {
  to: string;
  amount: string | undefined;
  networkKey: string;
  tokenBalance: TokenBalance;
};

export function getAssetOptions(symbol: string, type: AssetsType, assetId: string) {
  if (type === 'equilibrium') return assetFromToken(symbol)[0]; // TODO: сейчас currencyId лежит в новом JSON, возможно можно его брать оттуда

  const { currencyId } = state.assetsMap.find(({ id }) => id === assetId)!;

  if (type === 'stable') return { Stable: currencyId!.toUpperCase() };
  if (type === 'vsToken') return { VSToken: currencyId!.toUpperCase() };
  if (type === 'vToken') return { VToken: currencyId!.toUpperCase() };
  if (type === 'token2') return { Token2: currencyId }; // TODO ВАЖНО: Проверить правильно ли задан параметр
  if (type === 'foreignAsset') return { ForeignAsset: currencyId };
  if (type === 'liquidCrowdloan') return { LiquidCrowdloan: currencyId };
  if (type === 'stableAssetPoolToken') return { StableAssetPoolToken: currencyId };
  if (type === 'soraAsset') return currencyId;

  return { Token: symbol.toUpperCase() };
}

export function getPrecisionValue(
  _amount: string | undefined,
  precision: number,
  returnFPNumber = false
): string | FPNumber {
  const amount = _amount === '' || _amount === undefined ? '0' : _amount;
  const amountFP = new FPNumber(amount, precision);

  return returnFPNumber ? amountFP : amountFP.toCodecString();
}

export function createExtrinsicTransfer(props: ExtrinsicTransferProps): SubmittableExtrinsic<'promise'> | null {
  const { amount, tokenBalance, to, networkKey } = props;
  const api = state.getSubstrateApiMap[networkKey].api;

  if (!api) return null;

  const { precision, assetId: id, balances, symbol } = tokenBalance;
  const type = balances.find((net) => net.name.toLowerCase() === networkKey.toLowerCase())!.type;
  const ormlOptions = getAssetOptions(symbol, type, id);
  const precisionAmount = getPrecisionValue(amount, precision) as string;

  try {
    switch (type) {
      case 'normal':
        return api.tx.balances.transfer(to, precisionAmount);

      case 'equilibrium':
        return api.tx.eqBalances.transfer(ormlOptions, to, precisionAmount);

      case 'ormlChain':
        return api.tx.tokens.transfer(to, ormlOptions, precisionAmount);

      case 'soraAsset':
        return api.tx.assets.transfer(ormlOptions, to, precisionAmount);

      default:
        return api.tx.currencies.transfer(to, ormlOptions, precisionAmount);
    }
  } catch (e) {
    console.info('Unable to create extrinsic', e);

    return null;
  }
}
