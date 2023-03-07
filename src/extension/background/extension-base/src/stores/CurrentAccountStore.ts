// Copyright 2019-2022 @subwallet/extension-koni-ui authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { EXTENSION_PREFIX } from '../defaults';
import SubscribableStore from './SubscribableStore';

export interface CurrentAccountInfo {
  address: string;
  ethereumAddress: string;
  name: string;
  isMobile: boolean;
  currentGenesisHash: string | null;
  allGenesisHash?: string;
}

export default class CurrentAccountStore extends SubscribableStore<CurrentAccountInfo | undefined> {
  constructor() {
    super(EXTENSION_PREFIX ? `${EXTENSION_PREFIX}current_account` : null);
  }
}
