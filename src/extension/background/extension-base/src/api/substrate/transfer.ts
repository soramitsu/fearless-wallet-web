// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { KeyringPair } from '@polkadot/keyring/types';
import { FPNumber } from '@sora-substrate/util';
import { state } from '@extension-base/background/handlers';
import { getTokenInfo } from '@extension-base/api/substrate/registry';
import { signAndSendExtrinsic } from '@extension-base/api/substrate/shared/signAndSendExtrinsic';
import { checkMainToken } from '@extension-base/api/substrate/balance';
import { createExtrinsicTransfer } from '@extension-base/api/substrate/utils';
import type { AccountInfoWithProviders, AccountInfoWithRefCount } from '@polkadot/types/interfaces';
import type { AssetJson } from '@/interfaces';
import {
  ApiProps,
  BasicTxResponse,
  TransferErrorCode,
  SignerType,
  TokenBalance,
} from '@/extension/background/extension-base/src/background/types/types';
import { NetworkName } from '@/interfaces';

export async function getExistentialDeposit(
  networkKey: string,
  token: string,
  dotSamaApiMap: Record<string, ApiProps>
): Promise<string> {
  const apiProps = dotSamaApiMap[networkKey];
  await apiProps.api?.isReady;
  const api = apiProps.api;

  const tokenInfo = getTokenInfo(token);
  const isMainToken = checkMainToken(networkKey, tokenInfo.id);

  if (tokenInfo && isMainToken) {
    if (api?.consts?.balances?.existentialDeposit) {
      return api.consts.balances.existentialDeposit.toString();
    } else if (api?.consts?.eqBalances?.existentialDeposit) {
      return api.consts.eqBalances.existentialDeposit.toString();
    }
  }

  return '0';
}

function isRefCount(
  accountInfo: AccountInfoWithProviders | AccountInfoWithRefCount
): accountInfo is AccountInfoWithRefCount {
  return !!(accountInfo as AccountInfoWithRefCount).refcount;
}

export async function checkReferenceCount(
  networkKey: string,
  address: string,
  dotSamaApiMap: Record<string, ApiProps>
): Promise<boolean> {
  const apiProps = dotSamaApiMap[networkKey];
  await apiProps.api?.isReady;
  const api = apiProps.api;

  if (apiProps.isEthereum) {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const accountInfo: AccountInfoWithProviders | AccountInfoWithRefCount = await api.query.system.account(address);

  return accountInfo
    ? isRefCount(accountInfo)
      ? !accountInfo.refcount.isZero()
      : !accountInfo.consumers.isZero()
    : false;
}

export async function estimateFee(
  networkKey: string,
  fromKeypair: KeyringPair | undefined,
  to: string,
  value: string | undefined,
  tokenBalance: TokenBalance
): Promise<number> {
  const fee = 0;

  if (fromKeypair === undefined) return fee;

  const apiProps = state.getSubstrateApiMap[networkKey];
  const api = apiProps.api;

  if (!api) return 0;

  await api.isReadyOrError;

  const extrinsic = createExtrinsicTransfer({
    amount: value,
    api,
    tokenBalance,
    to,
    networkKey,
  });

  if (!extrinsic) return 0;

  const paymentInfo = await extrinsic.paymentInfo(to);
  const partialFee = paymentInfo ? +paymentInfo.partialFee : 0;
  const result = new FPNumber(partialFee, tokenBalance?.precision);

  return result.toNumber();
}

export function getUnsupportedResponse(): BasicTxResponse {
  return {
    status: false,
    errors: [
      {
        code: TransferErrorCode.UNSUPPORTED,
        message: 'The transaction of current network is unsupported',
      },
    ],
  };
}

export interface MakeTransferProps {
  networkKey: NetworkName;
  to: string;
  from: string;
  amount: string;
  password: string | undefined;
  tokenInfo: AssetJson;
  isSavePass?: boolean;
  callback: (data: BasicTxResponse) => void;
}

export async function makeTransfer({
  from,
  networkKey,
  to,
  tokenInfo,
  isSavePass,
  password,
  amount,
  callback,
}: MakeTransferProps): Promise<void> {
  const txState: BasicTxResponse = {};
  const apiProps = state.getSubstrateApiMap[networkKey];

  await apiProps.api?.isReady;

  const tokenBalance = state.balanceMap[from].find(({ assetId, relayChain }) => {
    if (tokenInfo.relayChain) return assetId === tokenInfo.id && relayChain === tokenInfo.relayChain;
    else return assetId === tokenInfo.id;
  })!;

  const extrinsic = createExtrinsicTransfer({
    amount,
    api: apiProps.api!,
    tokenBalance,
    to,
    networkKey,
  });

  await signAndSendExtrinsic({
    type: SignerType.PASSWORD,
    apiProps,
    callback,
    extrinsic,
    txState,
    password,
    isSavePass,
    address: from,
    errorMessage: 'error transfer',
  });
}
