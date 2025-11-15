// Copyright 2019-2022 @polkadot/extension authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { InjectedAccount, InjectedAccounts, Unsubcall } from '@polkadot/extension-inject/types';
import type { SendRequest } from '@extension-base/page/types';

// External to class, this.# is not private enough (yet)
let sendRequest: SendRequest;

export default class Accounts implements InjectedAccounts {
  constructor(_sendRequest: SendRequest) {
    sendRequest = _sendRequest;
  }

  public get(_anyType?: boolean): Promise<InjectedAccount[]> {
    // Parameter retained for API compatibility; actual value unused by the extension
    return sendRequest('pub(accounts.list)');
  }

  public subscribe(cb: (accounts: InjectedAccount[]) => unknown): Unsubcall {
    let id: string | null = null;

    sendRequest('pub(accounts.subscribe)', null, cb)
      .then((subId): void => {
        id = subId;
      })
      .catch(console.error);

    return (): void => {
      if (id) sendRequest('pub(accounts.unsubscribe)', { id }).catch(console.error);
    };
  }
}
