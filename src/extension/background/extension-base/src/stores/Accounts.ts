// Copyright 2019-2022 @polkadot/extension-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { EXTENSION_PREFIX } from '../defaults';
import BaseStore from './Base';
import type { KeyringJson, KeyringStore } from '@polkadot/ui-keyring/types';

export default class AccountsStore extends BaseStore<KeyringJson> implements KeyringStore {
  constructor() {
    super(EXTENSION_PREFIX);
  }

  public override set(key: string, value: KeyringJson, update?: () => void): void {
    // shortcut, don't save testing accounts in extension storage
    if (key.startsWith('account:') && value.meta && value.meta.isTesting) {
      update && update();

      return;
    }

    super.set(key, value, update);
  }
}
