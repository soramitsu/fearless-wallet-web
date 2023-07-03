// Copyright 2019-2022 @polkadot/extension authors & contributors
// SPDX-License-Identifier: Apache-2.0
import { assert } from '@polkadot/util';
import { canDerive } from '@extension-base/utils/utils';
import type { NetworkJson } from '@extension-base/types';
import type { InjectedAccount } from '@polkadot/extension-inject/types';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';

export function withErrorLog(fn: () => unknown): void {
  try {
    const p = fn();

    if (p && typeof p === 'object' && typeof (p as Promise<unknown>).catch === 'function') {
      (p as Promise<unknown>).catch(console.error);
    }
  } catch (e) {
    console.error(e);
  }
}

export function stripUrl(url: string): string {
  assert(
    url && (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('ipfs:') || url.startsWith('ipns:')),
    `Invalid url ${url}, expected to start with http: or https: or ipfs: or ipns:`
  );

  const parts = url.split('/');

  return parts[2];
}

export function transformAccounts(accounts: SubjectInfo, anyType = false): InjectedAccount[] {
  return Object.values(accounts)
    .filter(
      ({
        json: {
          meta: { isHidden },
        },
      }) => !isHidden
    )
    .filter(({ type }) => (anyType ? true : canDerive(type)))
    .sort((a, b) => (a.json.meta.whenCreated || 0) - (b.json.meta.whenCreated || 0))
    .map(
      ({
        json: {
          address,
          meta: { genesisHash, name },
        },
        type,
      }): InjectedAccount => ({
        address,
        genesisHash,
        name,
        type,
      })
    );
}

export function transformAddresses(addresses: SubjectInfo): InjectedAccount[] {
  return Object.values(addresses)
    .sort((a, b) => (a.json.meta.whenCreated || 0) - (b.json.meta.whenCreated || 0))
    .map(
      ({
        json: {
          address,
          meta: { name },
        },
        type,
      }): InjectedAccount => ({
        address,
        name,
        type,
      })
    );
}
