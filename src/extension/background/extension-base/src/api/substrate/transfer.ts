// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { assetFromToken } from '@equilab/api';

import { SubmittableExtrinsic } from '@polkadot/api/promise/types';
import { KeyringPair } from '@polkadot/keyring/types';
import { AccountInfoWithProviders, AccountInfoWithRefCount, EventRecord } from '@polkadot/types/interfaces';
import { BN } from '@polkadot/util';
import { FPNumber } from '@sora-substrate/math';
import {
  ApiProps,
  BasicTxResponse,
  TransferErrorCode,
  ExternalRequestPromise,
  ExternalRequestPromiseStatus,
  SignerType,
  SupportTransferResponse,
  TokenBalance,
} from '../../background/types/types';
import { TokenInfo } from '../evm/types/ether';
import { state } from '../../background/handlers';
import { getTokenInfo } from './registry';
import { signAndSendExtrinsic } from './shared/signAndSendExtrinsic';
import { checkMainToken } from './balance';
import { createExtrinsicTransfer } from './utils';
import { AssetJson } from '@/interfaces';

// import { FOUR_INSTRUCTIONS_PARACHAIN_WEIGHT, getOrmlOptions } from '@/util/teleport';

export async function getExistentialDeposit(
  networkKey: string,
  token: string,
  dotSamaApiMap: Record<string, ApiProps>
): Promise<string> {
  const apiProps = await dotSamaApiMap[networkKey].isReady;
  const api = apiProps.api;

  const tokenInfo = await getTokenInfo(networkKey, api, token);
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
  const apiProps = await dotSamaApiMap[networkKey].isReady;
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

export async function checkSupportTransfer(
  networkKey: string,
  token: string,
  dotSamaApiMap: Record<string, ApiProps>
): Promise<SupportTransferResponse> {
  const apiProps = await dotSamaApiMap[networkKey].isReady;

  if (apiProps.isEthereum) {
    return {
      supportTransfer: true,
      supportTransferAll: true,
    };
  }

  if (
    ['subspace_gemini_3a', 'kulupu', 'joystream', 'equilibrium_parachain', 'genshiro_testnet', 'genshiro'].includes(
      networkKey
    )
  ) {
    return {
      supportTransfer: false,
      supportTransferAll: false,
    };
  }

  const api = apiProps.api;
  const isTxCurrenciesSupported = !!api && !!api.tx && !!api.tx.currencies;
  const isTxBalancesSupported = !!api && !!api.tx && !!api.tx.balances;
  const isTxTokensSupported = !!api && !!api.tx && !!api.tx.tokens;
  const isTxEqBalancesSupported = !!api && !!api.tx && !!api.tx.eqBalances;
  const result: SupportTransferResponse = {
    supportTransfer: false,
    supportTransferAll: false,
  };

  if (!(isTxCurrenciesSupported || isTxBalancesSupported || isTxTokensSupported || isTxEqBalancesSupported)) {
    return result;
  }

  const tokenInfo = await getTokenInfo(networkKey, api, token);
  const isMainToken = checkMainToken(networkKey, tokenInfo.id);
  const type = state.networkMap[networkKey].assets.find((asset) => asset.assetId === tokenInfo?.id)?.type;

  if (tokenInfo && type && !apiProps.isEthereum && api.query.contracts) {
    // for PSP tokens
    return {
      supportTransfer: true,
      supportTransferAll: true,
    };
  }

  if (
    ['karura', 'acala', 'acala_testnet'].includes(networkKey) &&
    tokenInfo &&
    !isMainToken &&
    isTxCurrenciesSupported
  ) {
    result.supportTransfer = true;
    result.supportTransferAll = false;
  } else if (['kintsugi', 'kintsugi_test', 'interlay'].includes(networkKey) && tokenInfo && isTxTokensSupported) {
    result.supportTransfer = true;
    result.supportTransferAll = true;
  } else if (
    ['genshiro_testnet', 'genshiro', 'equilibrium_parachain'].includes(networkKey) &&
    tokenInfo &&
    isTxEqBalancesSupported
  ) {
    result.supportTransfer = true;
    result.supportTransferAll = false;
  } else if (
    tokenInfo &&
    ((networkKey === 'crab' && tokenInfo.symbol === 'CKTON') ||
      (networkKey === 'pangolin' && tokenInfo.symbol === 'PKTON'))
  ) {
    result.supportTransfer = true;
    result.supportTransferAll = true;
  } else if (isTxBalancesSupported && (!tokenInfo || isMainToken)) {
    result.supportTransfer = true;
    result.supportTransferAll = true;
  } else if (['pioneer', 'bitcountry'].includes(networkKey) && tokenInfo && tokenInfo.symbol === 'BIT') {
    result.supportTransfer = true;
    result.supportTransferAll = true;
  } else if (['statemint', 'statemine'].includes(networkKey) && tokenInfo) {
    result.supportTransfer = true;
    result.supportTransferAll = true;
  }

  return result;
}

export async function estimateFee(
  networkKey: string,
  fromKeypair: KeyringPair | undefined,
  to: string,
  value: string | undefined,
  transferAll: boolean,
  dotSamaApiMap: Record<string, ApiProps>,
  tokenInfo: TokenBalance
): Promise<number> {
  const fee = 0;
  // eslint-disable-next-line
  // let feeSymbol = undefined;

  if (fromKeypair === undefined) {
    return fee;
  }

  const apiProps = await dotSamaApiMap[networkKey].isReady;
  const api = apiProps.api;

  const extrinsic = createExtrinsicTransfer({
    amount: value,
    api,
    asset: tokenInfo.name,
    networkProps: tokenInfo,
    to,
    networkKey,
  });

  const paymentInfo = await extrinsic?.paymentInfo(to);
  const partialFee = paymentInfo ? +paymentInfo.partialFee : 0;
  const result = new FPNumber(partialFee, tokenInfo?.precision);

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

export function updateTransferResponseTxResult(
  networkKey: string,
  tokenInfo: AssetJson,
  response: BasicTxResponse,
  records: EventRecord[],
  transferAmount?: string
): void {
  if (!response.txResult) {
    if (tokenInfo) {
      response.txResult = { change: transferAmount || '0' };
    } else {
      response.txResult = { change: '0' };
    }
  }

  let isFeeUseMainTokenSymbol = true;
  const isMainToken = checkMainToken(networkKey, tokenInfo.id);

  for (let index = 0; index < records.length; index++) {
    const record = records[index];

    if (['karura', 'acala', 'acala_testnet'].includes(networkKey) && tokenInfo && !isMainToken) {
      if (record.event.section === 'currencies' && record.event.method.toLowerCase() === 'transferred') {
        if (index === 0) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          response.txResult.fee = record.event.data[3]?.toString() || '0';
          response.txResult.feeSymbol = tokenInfo.symbol;

          isFeeUseMainTokenSymbol = false;
        } else {
          response.txResult.change = record.event.data[3]?.toString() || '0';
          response.txResult.changeSymbol = tokenInfo.symbol;
        }
      }
    } else if (['kintsugi', 'kintsugi_test', 'interlay'].includes(networkKey) && tokenInfo) {
      if (record.event.section === 'tokens' && record.event.method.toLowerCase() === 'transfer') {
        response.txResult.change = record.event.data[3]?.toString() || '0';
        response.txResult.changeSymbol = tokenInfo.symbol;
      }
    } else if (['genshiro_testnet', 'genshiro', 'equilibrium_parachain'].includes(networkKey) && tokenInfo) {
      if (record.event.section === 'eqBalances' && record.event.method.toLowerCase() === 'transfer') {
        response.txResult.change = record.event.data[3]?.toString() || '0';
        response.txResult.changeSymbol = tokenInfo.symbol;
      }
    } else if (['pioneer', 'bitcountry'].includes(networkKey) && tokenInfo && !isMainToken) {
      if (record.event.section === 'tokens' && record.event.method.toLowerCase() === 'transfer') {
        response.txResult.change = record.event.data[3]?.toString() || '0';
        response.txResult.changeSymbol = tokenInfo.symbol;
      }
    } else if (['statemint', 'statemine'].includes(networkKey) && tokenInfo && !isMainToken) {
      if (record.event.section === 'assets' && record.event.method.toLowerCase() === 'transferred') {
        response.txResult.change = record.event.data[3]?.toString() || '0';
        response.txResult.changeSymbol = tokenInfo.symbol;
      }
    } else {
      if (record.event.section === 'balances' && record.event.method.toLowerCase() === 'transfer') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        response.txResult.change = record.event.data[2]?.toString() || '0';
      } else if (record.event.section === 'xTokens' && record.event.method.toLowerCase() === 'transferred') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        response.txResult.change = record.event.data[2]?.toString() || '0';
      }
    }

    if (
      isFeeUseMainTokenSymbol &&
      record.event.section === 'balances' &&
      record.event.method.toLowerCase() === 'withdraw'
    ) {
      if (!response.txResult.fee) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        response.txResult.fee = record.event.data[1]?.toString() || '0';
      }
    }
  }
}

export interface TransferDoSignAndSendProps {
  apiProps: ApiProps;
  networkKey: string;
  tokenInfo: TokenInfo | undefined;
  extrinsic: SubmittableExtrinsic;
  _updateResponseTxResult: (
    networkKey: string,
    tokenInfo: undefined | TokenInfo,
    response: BasicTxResponse,
    records: EventRecord[],
    transferAmount?: string
  ) => void;
  callback: (data: BasicTxResponse) => void;
  transferAmount?: string;
  signFunction: () => Promise<void>;
  updateState?: (promise: Partial<ExternalRequestPromise>) => void;
}

export async function doSignAndSend({
  _updateResponseTxResult,
  apiProps,
  callback,
  extrinsic,
  networkKey,
  signFunction,
  tokenInfo,
  transferAmount,
  updateState,
}: TransferDoSignAndSendProps) {
  const api = apiProps.api;
  const response: BasicTxResponse = {
    errors: [],
  };

  function updateResponseByEvents(response: BasicTxResponse, records: EventRecord[]) {
    records.forEach((record) => {
      const {
        event: {
          method,
          section,
          data: [error],
        },
      } = record;

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const isFailed = section === 'system' && method === 'ExtrinsicFailed';
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const isSuccess = section === 'system' && method === 'ExtrinsicSuccess';

      console.info('Transaction final: ', isFailed, isSuccess);

      if (isFailed) {
        response.status = false;
        response.txError = true;

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        if (error.isModule) {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          const decoded = api.registry.findMetaError(error.asModule);
          const { docs, method, section } = decoded;

          const errorMessage = docs.join(' ');

          console.info(`${section}.${method}: ${errorMessage}`);
          // response.data = {
          //   section,
          //   method,
          //   message: errorMessage
          // };
          response.errors?.push({
            code: TransferErrorCode.TRANSFER_ERROR,
            message: errorMessage,
          });
        } else {
          // Other, CannotLookup, BadOrigin, no extra info
          console.info(error.toString());
          response.errors?.push({
            code: TransferErrorCode.TRANSFER_ERROR,
            message: error.toString(),
          });
        }
      } else if (isSuccess) {
        response.status = true;
      }
    });

    _updateResponseTxResult(networkKey, tokenInfo, response, records, transferAmount);
  }

  await signFunction();

  await extrinsic.send(({ events = [], status }) => {
    console.info('Transaction status:', status.type, status.hash.toHex());

    if (status.isInBlock) {
      callback(response);

      updateResponseByEvents(response, events);

      response.extrinsicHash = extrinsic.hash.toHex();
      callback(response);

      if (response.status !== undefined) {
        updateState &&
          updateState({
            status: response.status ? ExternalRequestPromiseStatus.COMPLETED : ExternalRequestPromiseStatus.FAILED,
          });
      }
    } else if (status.isFinalized) {
      response.isFinalized = true;
      callback(response);
    } else {
      callback(response);
    }
  });
}

interface CreateTransferExtrinsicProps {
  apiProp: ApiProps;
  networkKey: string;
  to: string;
  from: string;
  value: string;
  transferAll: boolean;
  tokenInfo: TokenBalance;
}

export const createTransferExtrinsic = async ({
  apiProp,
  from,
  networkKey,
  to,
  tokenInfo,
  transferAll,
  value,
}: CreateTransferExtrinsicProps): Promise<SubmittableExtrinsic | null> => {
  const api = apiProp.api;

  // const isMainToken = checkMainToken(networkKey, tokenInfo.id);
  const transfer = createExtrinsicTransfer({
    amount: value,
    api,
    asset: tokenInfo.name,
    networkProps: tokenInfo,
    to,
    networkKey,
  });

  return transfer;
};

export interface MakeTransferProps {
  networkKey: string;
  to: string;
  from: string;
  value: string;
  transferAll: boolean;
  dotSamaApiMap: Record<string, ApiProps>;
  tokenInfo: AssetJson;
  isSavePass?: boolean;
  callback: (data: BasicTxResponse) => void;
}

export async function makeTransfer({
  callback,
  dotSamaApiMap,
  from,
  networkKey,
  to,
  tokenInfo,
  transferAll,
  value,
}: MakeTransferProps): Promise<void> {
  const txState: BasicTxResponse = {};
  const apiProps = await dotSamaApiMap[networkKey].isReady;
  const transferAmount = value;

  const tokenBalance = state.balanceMap[from].find(
    (balance) => balance.name === tokenInfo.name && balance.relayChain === tokenInfo.relayChain
  )!;
  const extrinsic = await createTransferExtrinsic({
    transferAll: transferAll,
    value: value,
    from: from,
    networkKey: networkKey,
    tokenInfo: tokenBalance,
    to: to,
    apiProp: apiProps,
  });

  const updateResponseTxResult = (response: BasicTxResponse, records: EventRecord[]) => {
    updateTransferResponseTxResult(networkKey, tokenInfo, response, records, transferAmount);
  };

  await signAndSendExtrinsic({
    type: SignerType.PASSWORD,
    apiProps: apiProps,
    callback: callback,
    extrinsic: extrinsic,
    txState: txState,
    address: from,
    updateResponseTxResult: updateResponseTxResult,
    errorMessage: 'error transfer',
  });
}
