// Copyright 2019-2022 @polkadot/extension authors & contributors
// SPDX-License-Identifier: Apache-2.0
import { assert } from '@polkadot/util';
import { canDerive } from '../../utils';
import type { NetworkJsonOld } from '../../types';
import type { NetworkJson } from '../../api/evm/types/ether';
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

export function mergeNetworkProviders(
  customNetwork: NetworkJson,
  predefinedNetwork: NetworkJson
): {
  currentProviderMethod: 'http' | 'ws';
  parsedProviderKey: string;
  parsedCustomProviders: Record<string, string>;
} {
  // merge providers for 2 networks with the same genesisHash
  if (customNetwork.customProviders) {
    const parsedCustomProviders: Record<string, string> = {};
    const currentProvider = customNetwork.customProviders[customNetwork.currentProvider || ''] || '';
    const currentProviderMethod: 'http' | 'ws' = currentProvider.startsWith('http') ? 'http' : 'ws';
    let parsedProviderKey = '';

    for (const customProvider of Object.values(customNetwork.customProviders)) {
      let exist = false;

      for (const [key, provider] of Object.entries(predefinedNetwork.providers)) {
        if (currentProvider === provider) {
          // point currentProvider to predefined
          parsedProviderKey = key;
        }

        if (provider === customProvider) {
          exist = true;
          break;
        }
      }

      if (!exist) {
        const index = Object.values(parsedCustomProviders).length;

        parsedCustomProviders[`custom_${index}`] = customProvider;
      }
    }

    for (const [key, parsedProvider] of Object.entries(parsedCustomProviders)) {
      if (currentProvider === parsedProvider) {
        parsedProviderKey = key;
      }
    }

    return { currentProviderMethod, parsedProviderKey, parsedCustomProviders };
  } else {
    return { currentProviderMethod: 'ws', parsedProviderKey: '', parsedCustomProviders: {} };
  }
}

export const getCurrentProvider = (data: NetworkJsonOld) => {
  if (!data?.currentProvider) {
    return null;
  }

  const customIndex = data.customNodes.findIndex(({ url }) => url === data.currentProvider);

  if (customIndex >= 0) return data.customNodes[customIndex];

  const defaultNodesIndex = data.nodes.findIndex(({ url }) => url === data.currentProvider);

  if (defaultNodesIndex >= 0) return data.nodes[customIndex];

  return null;
};
