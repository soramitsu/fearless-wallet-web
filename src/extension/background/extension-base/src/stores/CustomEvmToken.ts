// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { CustomTokenJson } from '../api/evm/types/ether';
import { EXTENSION_PREFIX } from '../defaults';
import SubscribableStore from './SubscribableStore';

export default class CustomTokenStore extends SubscribableStore<CustomTokenJson> {
  constructor() {
    super(EXTENSION_PREFIX ? `${EXTENSION_PREFIX}customToken` : null);
  }
}
