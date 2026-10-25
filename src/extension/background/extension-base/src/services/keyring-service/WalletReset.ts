import { keyring } from '@subwallet/ui-keyring';
import { ecdsaPairKeys } from '@extension-base/stores/EcdsaAccountRecords';
import {
  accountStoreKey, deletedWalletId, deletedWalletKey, walletAddressIdentity, walletRecordKeys, type DeletedWallet,
} from './DeletedWallets';
import type { StoreMutation } from '@extension-base/stores/StoreMutation';
import type { KeyringPair, KeyringPair$Json } from '@subwallet/keyring/types';
import type { FWKeyringMeta } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';

// Called inside the storage queue/transaction. Include unloaded keys too; a
// corrupt active record blocks reset rather than silently losing that wallet.
export function walletResetMutation(current: Record<string, unknown>, livePairs: KeyringPair[]): StoreMutation {
  const pairs = new Map<string, KeyringPair>();
  for (const [storageKey, record] of Object.entries(current)) {
    if (!storageKey.startsWith('account:')) continue;
    const json = record as KeyringPair$Json | undefined;
    if (!json || typeof json.encoded !== 'string' || !json.encoded ||
      !json.meta || typeof json.meta !== 'object' || Array.isArray(json.meta) || json.meta.isTesting)
      throw new Error('Reset cannot archive an invalid encrypted account.');
    const pair = keyring.createFromJson(json);
    const primary = accountStoreKey(pair);
    if (storageKey !== primary && storageKey !== ecdsaPairKeys(pair)?.legacy)
      throw new Error('Reset account does not match its storage identity.');
    if (!pairs.has(primary) || storageKey === primary) pairs.set(primary, pair);
  }
  if (livePairs.some((pair) => !current[accountStoreKey(pair)]))
    throw new Error('Reset recovery record is missing.');

  const byIdentity = new Map([...pairs.values()].map((pair) => [walletAddressIdentity(pair.address), pair]));
  const linked = new Set([...pairs.values()].flatMap((pair) => {
    const address = pair.meta.ethereumAddress;
    return typeof address === 'string' && address ? [walletAddressIdentity(address)] : [];
  }));
  const consumed = new Set<string>();
  const entries: Record<string, unknown> = {};
  // Parents come first; a standalone EVM key still gets its own recovery entry.
  const ordered = [...pairs.values()].sort((a, b) =>
    Number(linked.has(walletAddressIdentity(a.address))) - Number(linked.has(walletAddressIdentity(b.address))));
  for (const pair of ordered) {
    if (consumed.has(accountStoreKey(pair))) continue;
    const ethereumAddress = pair.meta.ethereumAddress;
    const child = typeof ethereumAddress === 'string' ? byIdentity.get(walletAddressIdentity(ethereumAddress)) : undefined;
    const group = [...new Set([pair, ...(child ? [child] : [])])];
    const accounts: Record<string, unknown> = {};
    for (const member of group) {
      for (const key of walletRecordKeys([member])) {
        if (current[key] !== undefined) { accounts[key] = current[key]; consumed.add(key); }
      }
      // Historical ECDSA-only records need a canonical copy for immediate
      // restoration; the exact earlier record remains alongside it.
      const primary = accountStoreKey(member);
      if (!accounts[primary]) accounts[primary] = current[ecdsaPairKeys(member)!.legacy];
    }
    const meta = pair.meta as FWKeyringMeta;
    const deletedAt = Date.now();
    const wallet: DeletedWallet = {
      address: pair.address, name: typeof meta.name === 'string' ? meta.name : '',
      walletEcosystem: meta.walletEcosystem ?? WalletEcosystem.Substrate, deletedAt, accounts,
    };
    entries[deletedWalletKey(`${deletedWalletId(pair.address, deletedAt)}:${crypto.randomUUID()}`)] = wallet;
  }
  const publicRecords = Object.keys(current).filter((key) => /^(address|contract):0x[0-9a-f]*/.test(key));
  // TON ciphertext, existing recovery entries and unrecognized inert records
  // remain intact. The new password can recover TON with the previous password.
  return { entries, remove: [...consumed, ...publicRecords, 'keyring', 'legacyPasswordPrompt'] };
}
