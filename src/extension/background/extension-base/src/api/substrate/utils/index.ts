import { ApiPromise, assetFromToken } from '@equilab/api';
import { SubmittableExtrinsic } from '@polkadot/api/types';
import { ISubmittableResult } from '@polkadot/types/types';
import { FPNumber } from '@sora-substrate/math';
import { state } from '../../../background/handlers';
import { TokenBalance } from '../../../background/types/types';
import { AssetJson, TypeAsset } from '@/interfaces';
type ExtrinsicTransferProps = {
  api: ApiPromise;
  to: string;
  amount: string | undefined;
  asset: string;
  networkKey: string;
  networkProps: TokenBalance;
};

export function getAssetOptions(symbol: string, type: TypeAsset, assetId: string) {
  if (type === 'stable') return { Stable: symbol.toUpperCase() };
  if (type === 'vToken') return { VToken: symbol.toUpperCase() };
  if (type === 'vsToken') return { VSToken: symbol.toUpperCase() };

  const assetsJson: AssetJson[] = state.tokenMap;
  const { currencyId } = assetsJson.find(({ id }) => id === assetId)!;

  if (type === 'foreignAsset') return { ForeignAsset: currencyId };
  if (type === 'liquidCrowdloan') return { LiquidCrowdloan: currencyId };
  if (type === 'stableAssetPoolToken') return { StableAssetPoolToken: currencyId };
  if (type === 'soraAsset') return currencyId;
  if (type === 'equilibrium') return assetFromToken(symbol)[0];

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

export function createExtrinsicTransfer(
  props: ExtrinsicTransferProps
): SubmittableExtrinsic<'promise', ISubmittableResult> | null {
  const { amount, api, asset, networkProps, to, networkKey } = props;
  const { precision, id } = networkProps;
  const type =
    (networkProps.balances.find((net) => net.name.toLowerCase() === networkKey.toLowerCase())!.type as TypeAsset) ?? '';
  const ormlOptions = getAssetOptions(asset, type, id);
  const precisionAmount = getPrecisionValue(amount, precision) as string;
  const prepType = 'native';

  try {
    switch (prepType) {
      case 'native':
        return api!.tx.balances.transfer(to, precisionAmount);
      // case 'equilibrium':
      //   return api!.tx.eqBalances.transfer(ormlOptions, to, precisionAmount);
      // case 'ormlChain':
      //   return api!.tx.tokens.transfer(to, ormlOptions, precisionAmount);
      // case 'soraAsset':
      //   return api!.tx.assets.transfer(ormlOptions, to, precisionAmount);
      default:
        return api!.tx.currencies.transfer(to, ormlOptions, precisionAmount);
    }
  } catch {
    return null;
  }
}
