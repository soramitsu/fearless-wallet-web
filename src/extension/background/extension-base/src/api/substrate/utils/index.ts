import { FPNumber } from '@sora-substrate/math';
import { ApiPromise } from '@polkadot/api';
import { state } from '@extension-base/background/handlers';
import type { TokenBalance } from '@extension-base/background/types/types';
import type { SubmittableExtrinsic } from '@polkadot/api/types';

type ExtrinsicTransferProps = {
  api: ApiPromise;
  to: string;
  amount: string | undefined;
  networkKey: string;
  tokenBalance: TokenBalance;
};

export function getAssetOptions(assetId: string) {
  const { currencyId, symbol, type } = state.assetsMap.find(({ id }) => id === assetId)!;

  if (type === 'stable') return { Stable: currencyId!.toUpperCase() };
  if (type === 'vsToken') return { VSToken: currencyId!.toUpperCase() };
  if (type === 'vToken') return { VToken: currencyId!.toUpperCase() };
  if (type === 'token2') return { Token2: currencyId }; // TODO ВАЖНО: Проверить правильно ли задан параметр
  if (type === 'foreignAsset') return { ForeignAsset: currencyId };
  if (type === 'liquidCrowdloan') return { LiquidCrowdloan: currencyId };
  if (type === 'stableAssetPoolToken') return { StableAssetPoolToken: currencyId };
  if (type === 'soraAsset') return currencyId;

  if (type === 'equilibrium') {
    console.log('symbol', currencyId);

    return currencyId;
  }

  if (type === 'assets') {
    return currencyId;
  }

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
  const { amount, api, tokenBalance, to, networkKey } = props;
  const { precision, assetId: id, balances } = tokenBalance;
  const type = balances.find((net) => net.name.toLowerCase() === networkKey.toLowerCase())!.type;
  const ormlOptions = getAssetOptions(id);
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

      // TODO
      case 'assets':
        return api.tx.assets.transfer(ormlOptions, to, precisionAmount);

      default:
        return api.tx.currencies.transfer(to, ormlOptions, precisionAmount);
    }
  } catch (e) {
    console.info('Unable to create extrinsic', e);

    return null;
  }
}
