// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { AuthUrls } from '../background/types';
import { EXTENSION_PREFIX } from '../defaults';
import SubscribableStore from './SubscribableStore';

export default class AuthorizeStore extends SubscribableStore<AuthUrls> {
  constructor() {
    super(EXTENSION_PREFIX ? `${EXTENSION_PREFIX}authorize` : null);
  }
}
