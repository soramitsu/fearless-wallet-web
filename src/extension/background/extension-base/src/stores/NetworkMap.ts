// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0

import SubscribableStore from '@extension-base/stores/SubscribableStore';
import { EXTENSION_PREFIX } from '@extension-base/defaults';
import type { NetworkJsonOld } from '@extension-base/types';

export default class NetworkMapStore extends SubscribableStore<Record<string, NetworkJsonOld>> {
  constructor() {
    super(EXTENSION_PREFIX ? `${EXTENSION_PREFIX}networkMap` : null);
  }
}
