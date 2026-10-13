import { keyring } from '@subwallet/ui-keyring';
import { addressKey, contractKey } from '@subwallet/ui-keyring/defaults';
import AddressesStore from '@extension-base/stores/Addresses';
import { alreadyPersistedAccountStore } from './AccountMetadata';
import type { FWKeyringMeta } from '@extension-base/types';
import type { KeyringAddressType } from '@subwallet/ui-keyring/types';

export interface PublicAddressUpdateOptions {
  requireExisting?: boolean;
  requireAbsent?: boolean;
  assertCurrent?: () => void;
}

export async function updatePublicAddress(
  address: string,
  type: KeyringAddressType,
  update: (meta: FWKeyringMeta) => FWKeyringMeta,
  options: PublicAddressUpdateOptions = {}
): Promise<void> {
  if (type !== 'address' && type !== 'contract') throw new Error('Unsupported public address type.');
  const storageKey = type === 'address' ? addressKey : contractKey;
  const identity = storageKey(address);
  await new AddressesStore().updateAndWait(identity, (current) => {
    if (current !== undefined && (
      !current || typeof current.address !== 'string' || storageKey(current.address) !== identity ||
      !current.meta || typeof current.meta !== 'object' || Array.isArray(current.meta)
    )) throw new Error('Stored public address does not match this address.');
    if (options.requireExisting && !current) throw new Error('Public address was removed. Retry with the current wallet.');
    if (options.requireAbsent && current) throw new Error('Public address already exists.');
    options.assertCurrent?.();
    const original = current ?? { address, meta: { whenCreated: Date.now() } };
    const meta = update(structuredClone(original.meta));
    delete meta.isRecent;
    return { ...original, meta };
  }, (json) => {
    const subject = type === 'address' ? keyring.addresses : keyring.contracts;
    subject.add(alreadyPersistedAccountStore, address, address, json);
  }, false);
}
