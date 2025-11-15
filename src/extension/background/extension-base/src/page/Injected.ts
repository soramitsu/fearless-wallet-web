// Copyright 2019-2022 @polkadot/extension authors & contributors
// SPDX-License-Identifier: Apache-2.0

import Accounts from '@extension-base/page/Accounts';
import Metadata from '@extension-base/page/Metadata';
import PostMessageProvider from '@extension-base/page/PostMessageProvider';
import Signer from '@extension-base/page/Signer';
import type { SendRequest } from '@extension-base/page/types';
import type { Injected, InjectedProvider } from '@polkadot/extension-inject/types';

export default class implements Injected {
  public readonly accounts: Accounts;
  public readonly metadata: Metadata;
  public readonly provider: InjectedProvider;
  public readonly signer: Signer;

  constructor(sendRequest: SendRequest) {
    this.accounts = new Accounts(sendRequest);
    this.metadata = new Metadata(sendRequest);
    this.provider = new PostMessageProvider(sendRequest);
    this.signer = new Signer(sendRequest);
  }
}
