import { FPNumber } from '@sora-substrate/util';
import { signAndSendExtrinsic } from '@extension-base/api/substrate/shared/signAndSendExtrinsic';
import { getAssetOptions, getPrecisionValue } from '@extension-base/api/substrate/utils';
import { getUtilityProps, getSubstrateAddress } from '@extension-base/background/utils/utils';
import { BasicTxResponse, TokenBalance, SignerType } from '@extension-base/background/types/types';
import State from '@extension-base/background/handlers/State';

import { Extrinsic } from './crossChain';
import { NetworkName } from '@/interfaces';

type ExtrinsicTransferProps = {
  to: string;
  amount: string | undefined;
  networkKey: NetworkName;
  tokenBalance: TokenBalance;
};

export function createExtrinsicTransfer(props: ExtrinsicTransferProps, state: State): Extrinsic {
  const { amount, tokenBalance, to, networkKey } = props;
  const api = state.getSubstrateApiMap[networkKey.toLowerCase()].api;

  if (!api) return null;

  const { precision, type, id } = tokenBalance.balances.find(
    ({ name }) => name.toLowerCase() === networkKey.toLowerCase()
  )!;
  const ormlOptions = getAssetOptions(id, state.assetsMap);
  const precisionAmount = getPrecisionValue(amount, precision) as string;

  try {
    switch (type) {
      case 'normal':
        return api.tx.balances.transfer(to, precisionAmount);

      case 'ormlChain':
        return api.tx.tokens.transfer(to, ormlOptions, precisionAmount);

      case 'equilibrium':
        return api.tx.eqBalances.transfer(ormlOptions, to, precisionAmount);

      case 'soraAsset':
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

export async function estimateFee(
  networkKey: string,
  to: string,
  value: string | undefined,
  tokenBalance: TokenBalance,
  state: State
): Promise<string> {
  const apiProps = state.getSubstrateApiMap[networkKey.toLowerCase()];
  const api = apiProps.api;

  if (!api) return '0';

  await api.isReadyOrError;

  const extrinsic = createExtrinsicTransfer(
    {
      amount: value,
      tokenBalance,
      to,
      networkKey,
    },
    state
  );

  if (!extrinsic) return '0';

  const { precision: utilityPrecision } = getUtilityProps(networkKey, state);

  try {
    const paymentInfo = await extrinsic.paymentInfo(to);
    const partialFee = paymentInfo ? +paymentInfo.partialFee : '0';
    const result = FPNumber.fromCodecValue(partialFee, utilityPrecision);

    return result.toString();
  } catch {
    return '0';
  }
}

export interface MakeTransferParams {
  networkKey: NetworkName;
  to: string;
  from: string;
  amount: string;
  password: string;
  assetId: string;
  isSavePass?: boolean;
  callback: (data: BasicTxResponse) => void;
  isMobile: boolean;
  state: State;
}

export async function makeTransfer({
  from,
  networkKey,
  to,
  assetId,
  isSavePass,
  password,
  amount,
  callback,
  isMobile,
  state,
}: MakeTransferParams): Promise<void> {
  const txState: BasicTxResponse = {};
  const apiProps = state.getSubstrateApiMap[networkKey.toLowerCase()];
  const api = apiProps.api;

  if (!api) return;

  await api?.isReady;

  const address = getSubstrateAddress(from, state);
  const tokenBalance = state.balanceMap[address].find(({ assetId: _assetId }) => _assetId === assetId)!;

  const extrinsic = createExtrinsicTransfer(
    {
      amount,
      tokenBalance,
      to,
      networkKey,
    },
    state
  );

  await signAndSendExtrinsic(
    {
      type: isMobile ? SignerType.MOBILE : SignerType.PASSWORD,
      apiProps,
      callback,
      extrinsic,
      txState,
      password,
      isSavePass,
      address: from,
      errorMessage: 'error transfer',
    },
    state
  );
}
