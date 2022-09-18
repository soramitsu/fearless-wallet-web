// Copyright 2019-2022 @polkadot/extension-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { EXTENSION_PREFIX } from '../defaults';
import BaseStore from './Base';
import type { KeyringJson, KeyringStore } from '@polkadot/ui-keyring/types';

class AccountsStore extends BaseStore<KeyringJson> implements KeyringStore {
  constructor() {
    super(`${EXTENSION_PREFIX}`);
  }
}
export const accountStore = new AccountsStore();
