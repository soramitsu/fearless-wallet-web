import { BN } from '@polkadot/util';
import { EXTENSION_PREFIX } from '@extension-base/defaults';
import { isEthereumAddress, decodeAddress, encodeAddress } from '@polkadot/util-crypto';
import type { NetworkJson } from '@extension-base/types';
import { IS_EXTENSION } from '@/consts/global';
import { isSameString } from '@/helpers';

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

export const getCurrentProvider = (data: NetworkJson): string | undefined => {
  if (!data?.currentProvider) return undefined;

  if (data.currentProvider.startsWith('custom') && data.customNodes.length)
    return data.customNodes.find((value) => value.url === data.currentProvider)?.url;

  return data.nodes.find((value) => value.url === data.currentProvider)?.url;
};

export function reformatAddress(address: string): string {
  try {
    if (!address) return '';

    const publicKey = decodeAddress(address);

    return encodeAddress(publicKey);
  } catch (e) {
    console.warn('Get error while reformat address', address, e);

    return address;
  }
}

export function isSameAddress(address1: string, address2: string) {
  if (isEthereumAddress(address1)) return isSameString(address1, address2);

  return reformatAddress(address1) === reformatAddress(address2);
}
