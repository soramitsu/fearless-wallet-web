// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { NetworkJson } from '../api/evm/types/ether';
import { EXTENSION_PREFIX } from '../defaults';
import SubscribableStore from './SubscribableStore';

export default class NetworkMapStore extends SubscribableStore<Record<string, NetworkJson>> {
  constructor() {
    super(EXTENSION_PREFIX ? `${EXTENSION_PREFIX}networkMap` : null);
  }
}
