import { isEthereumAddress } from '@polkadot/util-crypto';
import * as encoding from '@walletconnect/encoding';
import {
  EIP155_SIGNING_METHODS,
  type WalletConnectNotSupportRequest,
  type WalletConnectParamMap,
  type WalletConnectSessionRequest,
  type WalletConnectSigningMethod,
} from '@extension-base/services/wallet-connect-service/types';
import {
  findChainInfoByHalfGenesisHash,
  findChainInfoByChainId,
} from '@extension-base/services/network-service/helpers';
import {
  WALLET_CONNECT_EIP155_NAMESPACE,
  WALLET_CONNECT_POLKADOT_NAMESPACE,
  WALLET_CONNECT_REQUEST_KEY,
  WALLET_CONNECT_SUPPORT_NAMESPACES,
} from './consts';
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

export const parseRequestParams = <T = keyof WalletConnectSigningMethod>(params: unknown) => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  //@ts-ignore
  return params as WalletConnectParamMap[T];
};

export function parseAddressFromSendTxRequest(params: unknown) {
  const [tx] = parseRequestParams<EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION>(params);

  return tx.from;
}

export function parseAddressFromPersonalSign(params: unknown) {
  const [p1, p2] = parseRequestParams<EIP155_SIGNING_METHODS.PERSONAL_SIGN>(params);

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
  const expireTime = new Date(timeNum > 10 ** 12 ? timeNum : timeNum * SEC1);
  const now = new Date();

  return now.getTime() >= expireTime.getTime();
};

export const isSupportWalletConnectNamespace = (namespace: string): boolean => {
  return WALLET_CONNECT_SUPPORT_NAMESPACES.includes(namespace);
};

export const isSupportWalletConnectChain = (chain: string, chainInfoMap: Record<string, NetworkJson>): boolean => {
  const [namespace, info] = chain.split(':');

  if (namespace === WALLET_CONNECT_EIP155_NAMESPACE) return !!findChainInfoByChainId(chainInfoMap, parseInt(info));
  else if (namespace === WALLET_CONNECT_POLKADOT_NAMESPACE) return !!findChainInfoByHalfGenesisHash(chainInfoMap, info);

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
