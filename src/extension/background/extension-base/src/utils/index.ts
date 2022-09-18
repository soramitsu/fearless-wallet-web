// Copyright 2019-2022 @polkadot/extension authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { EXTENSION_PREFIX } from '../defaults';
import type { KeypairType } from '@polkadot/util-crypto/types';

let counter = 0;

export const getId = () => `${EXTENSION_PREFIX}.${Date.now()}.${++counter}`;

export const canDerive = (type?: KeypairType) => !!type && ['ed25519', 'sr25519', 'ecdsa', 'ethereum'].includes(type);
