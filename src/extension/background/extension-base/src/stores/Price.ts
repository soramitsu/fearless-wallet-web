// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { PriceJson } from '../background/types/types';
import { EXTENSION_PREFIX } from '../defaults';
import SubscribableStore from './SubscribableStore';

export default class PriceStore extends SubscribableStore<PriceJson> {
  constructor() {
    super(EXTENSION_PREFIX ? `${EXTENSION_PREFIX}price` : null);
  }
}
