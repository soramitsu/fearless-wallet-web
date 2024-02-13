import { assert } from '@polkadot/util';
import { type TransformAccountPayload } from '@extension-base/background/types/types';
import type { InjectedAccount } from '@polkadot/extension-inject/types';
import type { SingleAddress, SubjectInfo } from '@polkadot/ui-keyring/observable/types';

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

export function transformAccounts({ accounts, accountAuthType, authInfo }: TransformAccountPayload): InjectedAccount[] {
  const accountSelected = authInfo
    ? authInfo.isAllowed
      ? Object.keys(authInfo.isAllowedMap).filter((address) => authInfo.isAllowedMap[address])
      : []
    : [];

  const authTypeFilter = ({ type }: SingleAddress): boolean => {
    if (accountAuthType === 'substrate') return type !== 'ethereum';
    if (accountAuthType === 'evm') return type === 'ethereum';

    return true;
  };

  return Object.values(accounts)
    .filter(authTypeFilter)
    .filter(({ json: { address } }) => accountSelected.includes(address))
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
        genesisHash: '',
      })
    );
}
