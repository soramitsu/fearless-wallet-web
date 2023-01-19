// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { BalanceItem } from '../api/evm/types/ether';
import { EXTENSION_PREFIX } from '../defaults';
import SubscribableStore from './SubscribableStore';

export default class BalanceStore extends SubscribableStore<Record<string, BalanceItem>> {
  constructor() {
    super(`${EXTENSION_PREFIX}balance`);
  }
}
