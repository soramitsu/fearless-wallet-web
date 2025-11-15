import { isEthereumAddress } from '@polkadot/util-crypto';
import * as encoding from '@walletconnect/encoding';
import {
  EIP155_SIGNING_METHODS,
  POLKADOT_SIGNING_METHODS,
} from '@extension-base/services/wallet-connect-service/types';
import { getChainInfoByHalfGenesisHash, getChainInfoByChainId } from '@extension-base/services/network-service/helpers';
import {
  WALLET_CONNECT_EIP155_NAMESPACE,
  WALLET_CONNECT_POLKADOT_NAMESPACE,
  WALLET_CONNECT_REQUEST_KEY,
  WALLET_CONNECT_SUPPORT_NAMESPACES,
} from './consts';
import type {
  WalletConnectNotSupportRequest,
  WalletConnectParamMap,
  WalletConnectParamsFor,
  WalletConnectSessionRequest,
  WalletConnectSigningMethod,
} from '@extension-base/services/wallet-connect-service/types';
import type { NetworkJson } from '@extension-base/types';
import type { SignClientTypes } from '@walletconnect/types';
import type { ProposalTypes } from '@walletconnect/types/dist/types/sign-client/proposal';
import { SEC1 } from '@/consts/time';

export const getWCId = (id: number): string => {
  return [WALLET_CONNECT_REQUEST_KEY, Date.now(), id].join('.');
};

export const convertConnectRequest = (
  request: SignClientTypes.EventArguments['session_proposal']
): WalletConnectSessionRequest => {
  return {
    id: getWCId(request.id),
    isInternal: false,
    request: request,
    url: request.params.proposer.metadata.url,
  };
};

export const convertNotSupportRequest = (
  request: SignClientTypes.EventArguments['session_request'],
  url: string
): WalletConnectNotSupportRequest => {
  return {
    id: getWCId(request.id),
    isInternal: false,
    request: request,
    url: url,
  };
};

const isEip155SignMessageParams = (
  params: unknown
): params is WalletConnectParamMap[EIP155_SIGNING_METHODS.PERSONAL_SIGN] => {
  return Array.isArray(params) && params.length >= 2 && typeof params[0] === 'string' && typeof params[1] === 'string';
};

const isEip155SendTransactionParams = (
  params: unknown
): params is WalletConnectParamMap[EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION] => {
  if (!Array.isArray(params) || params.length === 0) return false;

  const [tx] = params;

  return typeof tx === 'object' && tx !== null && typeof (tx as { from?: unknown }).from === 'string';
};

const isPolkadotSignMessageParams = (
  params: unknown
): params is WalletConnectParamMap[POLKADOT_SIGNING_METHODS.POLKADOT_SIGN_MESSAGE] => {
  return (
    typeof params === 'object' &&
    params !== null &&
    typeof (params as { address?: unknown }).address === 'string' &&
    typeof (params as { message?: unknown }).message === 'string'
  );
};

const isPolkadotSignTransactionParams = (
  params: unknown
): params is WalletConnectParamMap[POLKADOT_SIGNING_METHODS.POLKADOT_SIGN_TRANSACTION] => {
  if (typeof params !== 'object' || params === null) return false;

  const { address, transactionPayload } = params as {
    address?: unknown;
    transactionPayload?: unknown;
  };

  return typeof address === 'string' && typeof transactionPayload === 'object' && transactionPayload !== null;
};

const isWalletConnectParamForMethod = <T extends WalletConnectSigningMethod>(
  method: T,
  params: unknown
): params is WalletConnectParamsFor<T> => {
  switch (method) {
    case EIP155_SIGNING_METHODS.PERSONAL_SIGN:
    case EIP155_SIGNING_METHODS.ETH_SIGN:
    case EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA:
    case EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V1:
    case EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V3:
    case EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V4:
      return isEip155SignMessageParams(params);

    case EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION:
      return isEip155SendTransactionParams(params);

    case POLKADOT_SIGNING_METHODS.POLKADOT_SIGN_MESSAGE:
      return isPolkadotSignMessageParams(params);

    case POLKADOT_SIGNING_METHODS.POLKADOT_SIGN_TRANSACTION:
      return isPolkadotSignTransactionParams(params);

    default:
      return false;
  }
};

export const parseRequestParams = <T extends WalletConnectSigningMethod>(
  params: unknown,
  method: T
): WalletConnectParamsFor<T> => {
  if (!isWalletConnectParamForMethod(method, params)) {
    throw new Error(`WalletConnect params mismatch for request ${method}`);
  }

  return params;
};

export function parseAddressFromSendTxRequest(params: unknown) {
  const [tx] = parseRequestParams(params, EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION);

  return tx.from;
}

export function parseAddressFromPersonalSign(params: unknown) {
  const [p1, p2] = parseRequestParams(params, EIP155_SIGNING_METHODS.PERSONAL_SIGN);

  if (typeof p1 === 'string' && isEthereumAddress(p1)) {
    return p1;
  } else if (typeof p2 === 'string' && isEthereumAddress(p2)) return p2;

  return '';
}

export const getEip155MessageAddress = (method: string, param: unknown): string => {
  switch (method) {
    case EIP155_SIGNING_METHODS.PERSONAL_SIGN:
    case EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA:
    case EIP155_SIGNING_METHODS.ETH_SIGN:
    case EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V3:
    case EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V4:
      return parseAddressFromPersonalSign(param);

    case EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION:
      return parseAddressFromSendTxRequest(param);

    default:
      return '';
  }
};

export const isWalletConnectRequest = (id?: string): boolean => {
  if (!id) {
    return false;
  }

  const [prefix] = id.split('.');

  return prefix === WALLET_CONNECT_REQUEST_KEY;
};

export const isProposalExpired = (params: ProposalTypes.Struct): boolean => {
  const timeNum = params.expiry;

  if (!timeNum) return true;

  const expireTime = new Date(timeNum > 10 ** 12 ? timeNum : timeNum * SEC1);
  const now = new Date();

  return now.getTime() >= expireTime.getTime();
};

export const isSupportWalletConnectNamespace = (namespace: string): boolean => {
  return WALLET_CONNECT_SUPPORT_NAMESPACES.includes(namespace);
};

export const isSupportWalletConnectChain = (chain: string, chainInfoMap: Record<string, NetworkJson>): boolean => {
  const [namespace, info] = chain.split(':');

  if (namespace === WALLET_CONNECT_EIP155_NAMESPACE) return !!getChainInfoByChainId(chainInfoMap, parseInt(info));
  else if (namespace === WALLET_CONNECT_POLKADOT_NAMESPACE) return !!getChainInfoByHalfGenesisHash(chainInfoMap, info);

  return false;
};

export function convertHexToUtf8(hex: string) {
  try {
    return encoding.hexToUtf8(hex);
  } catch (e) {
    return hex;
  }
}

export function generateHalfGenesisHash(genesisHash: string): string {
  return genesisHash.slice(2, Math.ceil(genesisHash.length / 2));
}
