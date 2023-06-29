import { FPNumber } from '@sora-substrate/math';
import { ApiPromise } from '@polkadot/api';
import { state } from '@extension-base/background/handlers';
import { BN } from '@polkadot/util';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import type { TokenBalance } from '@extension-base/background/types/types';
import { NetworkName } from '@/interfaces';

type ExtrinsicTransferProps = {
  api: ApiPromise;
  to: string;
  amount: string | undefined;
  networkKey: NetworkName;
  tokenBalance: TokenBalance;
};

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

  // TODO
  if (type === 'assets') {
    return new BN(currencyId!);
  }

  // TODO
  if (type === 'assetId') {
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
  const { precision, type, id } = tokenBalance.balances.find(
    ({ name }) => name.toLowerCase() === networkKey.toLowerCase()
  )!;
  const ormlOptions = getAssetOptions(id);
  const precisionAmount = getPrecisionValue(amount, precision) as string;

  try {
    switch (type) {
      case 'normal':
        return api.tx.balances.transfer(to, precisionAmount);

      case 'ormlChain':
        return api.tx.tokens.transfer(to, ormlOptions, precisionAmount);

      case 'soraAsset':
        return api.tx.assets.transfer(ormlOptions, to, precisionAmount);

      case 'equilibrium':
        return api.tx.eqBalances.transfer(ormlOptions, to, precisionAmount);

      // TODO
      case 'assets':
        return api.tx.assets.transfer(ormlOptions, to, precisionAmount);

      // TODO
      case 'assetId':
        return api.tx.assets.transfer(ormlOptions, to, precisionAmount);

      default:
        return api.tx.currencies.transfer(to, ormlOptions, precisionAmount);
    }
  } catch (e) {
    console.info('Unable to create extrinsic', e);

    return null;
  }
}
