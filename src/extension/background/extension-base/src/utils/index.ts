// Copyright 2019-2022 @polkadot/extension authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { EXTENSION_PREFIX } from '../defaults';
import type { KeypairType } from '@polkadot/util-crypto/types';

let counter = 0;

export function getId(): string {
  return `${EXTENSION_PREFIX}.${Date.now()}.${++counter}`;
}

export function canDerive(type?: KeypairType): boolean {
  return !!type && ['ed25519', 'sr25519', 'ecdsa', 'ethereum'].includes(type);
}
