import { signAndSendExtrinsic } from '@extension-base/api/substrate/shared/signAndSendExtrinsic';
import { getAssetOptions, getPrecisionValue } from '@extension-base/api/substrate';
import { getFPNumberCtor } from '@extension-base/services/utils/sora';
import { getBalanceNetworkName } from '@extension-base/api/evm/types';
import type { BasicTxResponse, TokenGroup } from '@extension-base/background/types/types';
import type { Extrinsic, ExtrinsicTransferProps } from '@extension-base/api/substrate/types';
import type State from '@extension-base/background/handlers/State';
import type { NetworkName } from '@/interfaces';
import { getUtilityProps } from '@/extension/background/extension-base/src/background/handlers/utils';
import { isSameString } from '@/helpers';

const getFPNumber = getFPNumberCtor;

export async function createExtrinsicTransfer(props: ExtrinsicTransferProps, state: State): Promise<Extrinsic> {
  const { amount, tokenBalance, to, networkKey } = props;
  const networkKeyLCase = networkKey.toLowerCase();

  const api = state.getSubstrateApiMap[networkKeyLCase].api;

  if (!api) return null;

  const balance = tokenBalance.balances.find((balanceItem) =>
    isSameString(getBalanceNetworkName(balanceItem), networkKey)
  )!;
  const { precision, type, id } = balance;
  const ormlOptions = getAssetOptions(id, state.networkService.assetsMap);
  const assetOptions = (ormlOptions ?? id) as unknown;
  const precisionAmount = await getPrecisionValue(amount, precision);

  try {
    switch (type) {
      case 'normal':
        if (api.tx.balances.transfer) return api.tx.balances.transfer(to, precisionAmount);

        if (api.tx.balances.transferAllowDeath) return api.tx.balances.transferAllowDeath(to, precisionAmount);

        return api.tx.balances.transferKeepAlive(to, precisionAmount);

      case 'ormlChain':
        return api.tx.tokens.transfer(to, assetOptions as never, precisionAmount);

      case 'equilibrium':
        return api.tx.eqBalances.transfer(assetOptions as never, to, precisionAmount);

      case 'soraAsset':
      case 'assets':
        return api.tx.assets.transfer(assetOptions as never, to, precisionAmount);

      default:
        return api.tx.currencies.transfer(to, assetOptions as never, precisionAmount);
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
  tokenBalance: TokenGroup,
  state: State
): Promise<string> {
  const apiProps = state.getSubstrateApiMap[networkKey.toLowerCase()];
  const api = apiProps.api;

  if (!api) return '0';

  await api.isReadyOrError;

  const extrinsic = await createExtrinsicTransfer(
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
  const FPNumber = await getFPNumber();

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
  assetId: string;
  callback?: (data: BasicTxResponse) => void;
  isMobile: boolean;
  state: State;
}

export async function makeTransfer({
  from,
  networkKey,
  to,
  assetId,
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

  const address = state.keyringService.getSubstrateAddress(from);
  const tokenBalance = state.balanceService.getAccountBalance(address).find(({ groupId }) => groupId === assetId)!;

  const extrinsic = await createExtrinsicTransfer(
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
      isMobile,
      apiProps,
      callback,
      extrinsic,
      txState,
      address: from,
      errorMessage: 'error transfer',
    },
    state
  );
}
