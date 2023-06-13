// Copyright 2019-2022 @polkadot/extension-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { EXTENSION_PREFIX } from '@extension-base/defaults';
import BaseStore from '@extension-base/stores/Base';
import type { MetadataDef } from '@polkadot/extension-inject/types';

export default class MetadataStore extends BaseStore<MetadataDef> {
  constructor() {
    super(EXTENSION_PREFIX && EXTENSION_PREFIX !== 'polkadot{.js}' ? `${EXTENSION_PREFIX}:metadata` : 'metadata');
  }
}
