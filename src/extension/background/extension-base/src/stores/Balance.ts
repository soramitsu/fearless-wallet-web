// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { type BalanceItem } from '@extension-base/api/evm/types/ether';
import { EXTENSION_PREFIX } from '@extension-base/defaults';
import SubscribableStore from '@extension-base/stores/SubscribableStore';

export default class BalanceStore extends SubscribableStore<Record<string, BalanceItem>> {
  constructor() {
    super(`${EXTENSION_PREFIX}balance`);
  }
}
