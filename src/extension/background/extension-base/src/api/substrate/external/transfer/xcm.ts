// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { EventRecord } from '@polkadot/types/interfaces';
import { ApiProps, BasicTxResponse } from '../../../../background/types';
import { NetworkJson, TokenInfo } from '../../../evm/types/ether';
import { isNetworksPairSupportedTransferCrossChain, createXcmExtrinsic, updateXcmResponseTxResult } from '../../../xcm';
import { signAndSendExtrinsic } from '../../shared/signAndSendExtrinsic';
import { getUnsupportedResponse } from '../../transfer';
import { ExternalProps } from '../shared';

interface MakeCrossChainTransferExternalProps extends ExternalProps {
  destinationNetworkKey: string;
  dotSamaApiMap: Record<string, ApiProps>;
  networkMap: Record<string, NetworkJson>;
  recipientAddress: string;
  senderAddress: string;
  tokenInfo: TokenInfo;
  value: string;
}

export const makeCrossChainTransferExternal = async ({
  callback,
  destinationNetworkKey,
  dotSamaApiMap,
  id,
  network: originalNetwork,
  networkMap,
  recipientAddress,
  senderAddress,
  setState,
  signerType,
  tokenInfo,
  updateState,
  value,
}: MakeCrossChainTransferExternalProps) => {
  const txState: BasicTxResponse = {};

  const originalNetworkKey = originalNetwork.key;
  const apiProps = await dotSamaApiMap[originalNetworkKey].isReady;

  if (
    !isNetworksPairSupportedTransferCrossChain(originalNetworkKey, destinationNetworkKey, tokenInfo.symbol, networkMap)
  ) {
    callback(getUnsupportedResponse());

    return;
  }

  const extrinsic = await createXcmExtrinsic({
    destinationNetworkKey: destinationNetworkKey,
    dotSamaApiMap: dotSamaApiMap,
    networkMap: networkMap,
    originNetworkKey: originalNetworkKey,
    to: recipientAddress,
    tokenInfo: tokenInfo,
    value: value,
  });

  const updateResponseTxResult = (response: BasicTxResponse, records: EventRecord[]) => {
    updateXcmResponseTxResult(originalNetworkKey, tokenInfo, response, records);
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
    errorMessage: 'error xcm transfer',
  });
};
