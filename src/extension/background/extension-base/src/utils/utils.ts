import { BN } from '@polkadot/util';
import { EXTENSION_PREFIX } from '@extension-base/defaults';
import { isEthereumAddress, decodeAddress, encodeAddress, ethereumEncode } from '@polkadot/util-crypto';
import { EXTENSION_REQUEST_URL } from '@extension-base/const';
import type { NetworkJson } from '@extension-base/types';
import type { KeypairType } from '@polkadot/util-crypto/types';
import { IS_EXTENSION } from '@/consts/global';

export function sumBN(inputArr: BN[]) {
  let rs = new BN(0);

  inputArr.forEach((input) => {
    rs = rs.add(input);
  });

  return rs;
}

let counter = 0;

export function getId(message = ''): string {
  return `${EXTENSION_PREFIX}.${IS_EXTENSION ? Date.now() + '.' : ''}${++counter}.${message}`;
}

export function canDerive(type?: KeypairType): boolean {
  return !!type && ['ed25519', 'sr25519', 'ecdsa', 'ethereum'].includes(type);
}

export const getCurrentProvider = (data: NetworkJson): string | undefined => {
  if (!data?.currentProvider) return undefined;

  if (data.currentProvider.startsWith('custom') && data.customNodes.length)
    return data.customNodes.find((value) => value.url === data.currentProvider)?.url;

  return data.nodes.find((value) => value.url === data.currentProvider)?.url;
};

export function reformatAddress(address: string, networkPrefix = 42, isEthereum = false): string {
  try {
    if (!address || address === '') return '';

    if (isEthereumAddress(address)) return address;

    const publicKey = decodeAddress(address);

    if (isEthereum) return ethereumEncode(publicKey);

    if (networkPrefix < 0) return address;

    return encodeAddress(publicKey, networkPrefix);
  } catch (e) {
    console.warn('Get error while reformat address', address, e);

    return address;
  }
}

export function isSameAddress(address1: string, address2: string) {
  if (isEthereumAddress(address1)) return address1.toLowerCase() === address2.toLowerCase();

  return reformatAddress(address1, 0) === reformatAddress(address2, 0);
}

export function isInternalRequest(url: string): boolean {
  return url === EXTENSION_REQUEST_URL;
}
