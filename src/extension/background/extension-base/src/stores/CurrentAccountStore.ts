// Copyright 2019-2022 @subwallet/extension-koni-ui authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { EXTENSION_PREFIX } from '../defaults';
import SubscribableStore from './SubscribableStore';

export interface CurrentAccountInfo {
  address: string;
  ethereumAddress: string;
  name: string;
  isMobile: boolean;
}

export default class CurrentAccountStore extends SubscribableStore<CurrentAccountInfo | null> {
  constructor() {
    super(EXTENSION_PREFIX ? `${EXTENSION_PREFIX}current_account` : null);
  }
}
