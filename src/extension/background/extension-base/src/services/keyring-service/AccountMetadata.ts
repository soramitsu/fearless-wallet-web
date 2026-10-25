import { keyring } from '@subwallet/ui-keyring';
import { isEthereumAddress } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import AccountsStore from '@extension-base/stores/Accounts';
import type { FWKeyringMeta } from '@extension-base/types';
import type { KeyringPair, KeyringPair$Json } from '@subwallet/keyring/types';
import type { KeyringStore } from '@subwallet/ui-keyring/types';

export const alreadyPersistedAccountStore: KeyringStore = {
  all: () => {}, get: () => {}, remove: () => {}, set: (_key, _value, update) => update?.(),
};

export function accountStorageKey(pair: KeyringPair): string {
  // Match ui-keyring/defaults.accountKey: lower-case raw address/public-key hex.
  const raw = isEthereumAddress(pair.address) ? pair.address.toLowerCase() : u8aToHex(pair.publicKey);
  return `account:${raw}`;
}

export function isCurrentAccountPair(pair: KeyringPair): boolean {
  try { return keyring.getPair(pair.address) === pair; } catch { return false; }
}

export async function updateAccountMetadata(
  pair: KeyringPair,
  update: (meta: FWKeyringMeta, json: KeyringPair$Json) => FWKeyringMeta | undefined,
  isCurrent: () => boolean = () => true,
  trackFailure = true
): Promise<boolean> {
  const valid = () => isCurrentAccountPair(pair) && isCurrent();
  const committed = await new AccountsStore().updateAndWait(accountStorageKey(pair), (current) => {
    if (!current || !valid()) return;
    const meta = update(current.meta, current);
    // Preserve the entire latest encrypted record, including unknown fields.
    return meta ? { ...current, meta } : undefined;
  }, (json) => {
    if (!valid()) return;
    pair.setMeta(json.meta);
    keyring.accounts.add(alreadyPersistedAccountStore, pair.address, pair.publicKey, json, pair.type);
  }, trackFailure);
  return committed !== undefined;
}
