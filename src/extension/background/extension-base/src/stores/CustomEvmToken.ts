// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { EXTENSION_PREFIX } from '@extension-base/defaults';
import SubscribableStore from '@extension-base/stores/SubscribableStore';
import type { CustomTokenJson } from '@extension-base/api/evm/types/ether';

export default class CustomTokenStore extends SubscribableStore<CustomTokenJson> {
  constructor() {
    super(EXTENSION_PREFIX ? `${EXTENSION_PREFIX}customToken` : null);
  }
}
