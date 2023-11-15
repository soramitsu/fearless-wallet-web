// Copyright 2019-2022 @polkadot/extension-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import BaseStore from '@extension-base/stores/Base';
import { EXTENSION_PREFIX } from '@extension-base/defaults';
import type { FWKeyringMeta } from '../types';
import type { KeyringStore } from '@polkadot/ui-keyring/types';
type FWKeyringJson = {
  address: string;
  meta: FWKeyringMeta;
};
export default class AccountsStore extends BaseStore<FWKeyringJson> implements KeyringStore {
  constructor() {
    super(EXTENSION_PREFIX);
  }

  public override set(key: string, value: FWKeyringJson, update?: () => void): void {
    // shortcut, don't save testing accounts in extension storage
    if (key.startsWith('account:') && value.meta && value.meta.isTesting) {
      update && update();

      return;
    }

    super.set(key, value, update);
  }
}
