import { ISubmittableResult } from '@polkadot/types/types';
import { FPNumber } from '@sora-substrate/math';
import type { AssetJson, TypeAsset, WalletBalance } from '@/interfaces';
import type { SubmittableExtrinsic } from '@polkadot/api/submittable/types';
import type { ApiPromise } from '@polkadot/api';
import NetworksController from '@/controllers/networksController';
import BaseApi from '@/util/BaseApi';

type ExtrinsicTransferProps = {
  api: ApiPromise;
  to: string;
  amount: string;
  asset: string;
  networkProps: WalletBalance;
};

const ORML_PALLETS_TYPES = ['ormlChain', 'equilibrium'];

function getAssetOptions(symbol: string, type: TypeAsset, assetId: string) {
  const assetsJson: AssetJson[] = NetworksController.getAssetsJson();
  const { currencyId } = assetsJson.find(({ id }) => id === assetId)!;

  if (type === 'stable') return { Stable: symbol.toUpperCase() };
  if (type === 'vToken') return { VToken: symbol.toUpperCase() };
  if (type === 'vsToken') return { VSToken: symbol.toUpperCase() };
  if (type === 'foreignAsset') return { ForeignAsset: currencyId };
  if (type === 'liquidCrowdloan') return { LiquidCrowdloan: currencyId };
  if (type === 'stableAssetPoolToken') return { StableAssetPoolToken: currencyId };
  if (type === 'soraAsset') return currencyId;
  if (type === 'equilibrium') return BaseApi.getEquilibriumAssetId(symbol);

  return { Token: symbol.toUpperCase() };
}

function getPrecisionValue(_amount: string, precision: number, returnFPNumber = false): string | FPNumber {
  const amount = _amount === '' ? '0' : _amount;
  const amountFP = new FPNumber(amount, precision);

  return returnFPNumber ? amountFP : amountFP.toCodecString();
}

function createExtrinsicTransfer(props: ExtrinsicTransferProps): SubmittableExtrinsic<'promise', any> | undefined {
  const { amount, api, asset, networkProps, to } = props;
  const { precision, type, assetId } = networkProps;
  const ormlOptions = getAssetOptions(asset, type, assetId);
  const precisionAmount = getPrecisionValue(amount, precision) as string;

  try {
    switch (type) {
      case 'native':
        return api!.tx.balances.transfer(to, precisionAmount);
      case 'equilibrium':
        return api!.tx.eqBalances.transfer(ormlOptions, to, precisionAmount);
      case 'ormlChain':
        return api!.tx.tokens.transfer(to, ormlOptions, precisionAmount);
      case 'soraAsset':
        return api!.tx.assets.transfer(ormlOptions, to, precisionAmount);
      default:
        return api!.tx.currencies.transfer(to, ormlOptions, precisionAmount);
    }
  } catch {
    return undefined;
  }
}

export { ORML_PALLETS_TYPES, getAssetOptions, createExtrinsicTransfer };
