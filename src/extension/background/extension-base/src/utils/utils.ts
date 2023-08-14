// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { BN } from '@polkadot/util';
import { EXTENSION_PREFIX } from '@extension-base/defaults';
import type { NetworkJson } from '@extension-base/types';
import type { KeypairType } from '@polkadot/util-crypto/types';

export function sumBN(inputArr: BN[]) {
  let rs = new BN(0);

  inputArr.forEach((input) => {
    rs = rs.add(input);
  });

  return rs;
}

let counter = 0;

export function getId(): string {
  return `${EXTENSION_PREFIX}.${Date.now()}.${++counter}`;
}

export function canDerive(type?: KeypairType): boolean {
  return !!type && ['ed25519', 'sr25519', 'ecdsa', 'ethereum'].includes(type);
}

export const getCurrentProvider = (data: NetworkJson): string | undefined => {
  if (!data?.currentProvider) {
    return undefined;
  }

  if (data.currentProvider.startsWith('custom') && data.customNodes.length) {
    return data.customNodes.find((value) => value.url === data.currentProvider)?.url;
  } else {
    return data.nodes.find((value) => value.url === data.currentProvider)?.url;
  }
};
