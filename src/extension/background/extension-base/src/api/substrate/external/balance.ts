// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { EventRecord } from '@polkadot/types/interfaces';
import { BasicTxResponse } from '../../../background/types/types';
import { signAndSendExtrinsic } from '../shared/signAndSendExtrinsic';
import { createTransferExtrinsic, updateTransferResponseTxResult } from '../transfer';
import { state } from '../../../background/handlers';
import { ExternalProps } from './shared';
import { AssetJson } from '@/interfaces';

interface MakeTransferExternalProps extends ExternalProps {
  recipientAddress: string;
  senderAddress: string;
  tokenInfo: AssetJson;
  transferAll: boolean;
  value: string;
}

export const makeTransferExternal = async ({
  apiProps,
  callback,
  id,
  network,
  recipientAddress,
  senderAddress,
  setState,
  signerType,
  tokenInfo,
  transferAll,
  updateState,
  value,
}: MakeTransferExternalProps): Promise<void> => {
  const networkKey = network.key;
  const txState: BasicTxResponse = {};
  const name = tokenInfo.displayName ?? tokenInfo.symbol;
  const tokenBalance = state.balanceMap[senderAddress][name];
  const transferAmount = value;
  const extrinsic = await createTransferExtrinsic({
    apiProp: apiProps,
    from: senderAddress,
    networkKey: networkKey,
    to: recipientAddress,
    tokenInfo: tokenBalance,
    transferAll: transferAll,
    value: value,
  });

  // if (!extrinsic) {
  //   callback(getUnsupportedResponse());

  //   return;
  // }

  const updateResponseTxResult = (response: BasicTxResponse, records: EventRecord[]) => {
    updateTransferResponseTxResult(networkKey, tokenInfo, response, records, transferAmount);
  };

  await signAndSendExtrinsic({
    id: id,
    setState: setState,
    type: signerType,
    updateState: updateState,
    apiProps: apiProps,
    callback: callback,
    extrinsic: extrinsic,
    txState: txState,
    address: senderAddress,
    updateResponseTxResult: updateResponseTxResult,
    errorMessage: 'error transfer',
  });
};
