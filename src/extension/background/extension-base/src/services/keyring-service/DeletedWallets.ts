import { isObject, u8aToHex } from '@polkadot/util';
import { decodeAddress, isEthereumAddress } from '@polkadot/util-crypto';
import { ecdsaPairKeys, ecdsaRecordKeys } from '@extension-base/stores/EcdsaAccountRecords';
import type { TonStoreAccount } from '@extension-base/stores/TonStore';
import type { DeletedWalletSummary } from '../../background/types/types';
import { WalletEcosystem } from '@/interfaces';

// Deleting a wallet takes it out of the wallet list and the keyring, not off the device (decisions.md, invariant 1).
// Every record that holds its keys is first stored, exactly as it was, under `deletedWallet:`, which no keyring
// version loads; only then are the records removed. Account access lists these wallets and puts the records back.

export const DELETED_WALLET_PREFIX = 'deletedWallet:';

// What @subwallet/ui-keyring 0.1.14 loads as an account (defaults.js accountRegex).
const ACCOUNT_RECORD_KEY = /^account:0x[0-9a-f]*/;

export interface DeletedWallet {
  /** The address the wallet list showed. */
  address: string;
  name: string;
  walletEcosystem: WalletEcosystem;
  deletedAt: number;
  /** Account store entries (`account:…`, and `archivedAccount:…` for an ECDSA account), each as it was stored. */
  accounts: Record<string, unknown>;
  /** The TON record, as it was stored under `ton:<address>`. */
  ton?: TonStoreAccount;
}

/** Where @subwallet/ui-keyring 0.1.14 stores a pair (genericSubject getStoreKey, defaults accountKey). */
export function accountStoreKey(pair: { address: string; publicKey: Uint8Array }): string {
  const rawKey = isEthereumAddress(pair.address) ? pair.address : u8aToHex(pair.publicKey);

  return `account:${u8aToHex(decodeAddress(rawKey, true))}`;
}

/** Every account store key that can hold the keys of these pairs: their records, and for ECDSA the earlier ones. */
export function walletRecordKeys(pairs: { address: string; publicKey: Uint8Array; type: string }[]): string[] {
  const keys = pairs.flatMap((pair) => {
    const ecdsa = ecdsaPairKeys(pair);

    return [accountStoreKey(pair), ...(ecdsa ? [ecdsa.legacy, ecdsa.archive] : [])];
  });

  return [...new Set(keys)];
}

// Each deletion is its own entry: deleting a wallet that was imported again never replaces an earlier copy.
export const deletedWalletId = (address: string, deletedAt: number): string => `${deletedAt}:${address}`;

export const deletedWalletKey = (id: string): string => `${DELETED_WALLET_PREFIX}${id}`;

export function readDeletedWallet(value: unknown): DeletedWallet | undefined {
  if (!isObject(value)) return undefined;

  const { address, accounts, deletedAt } = value as Partial<DeletedWallet>;

  if (typeof address !== 'string' || !address || typeof deletedAt !== 'number' || !isObject(accounts)) return undefined;

  return value as DeletedWallet;
}

/** The deleted wallets that are not in the wallet list again, newest first. */
export function summarizeDeletedWallets(
  stored: Record<string, unknown>,
  isInWallet: (address: string) => boolean
): DeletedWalletSummary[] {
  return Object.entries(stored)
    .filter(([key]) => key.startsWith(DELETED_WALLET_PREFIX))
    .flatMap(([key, value]) => {
      const wallet = readDeletedWallet(value);

      if (!wallet || isInWallet(wallet.address)) return [];

      return [
        {
          id: key.slice(DELETED_WALLET_PREFIX.length),
          address: wallet.address,
          name: typeof wallet.name === 'string' ? wallet.name : '',
          walletEcosystem: wallet.walletEcosystem ?? WalletEcosystem.Substrate,
          deletedAt: wallet.deletedAt,
        },
      ];
    })
    .sort((left, right) => right.deletedAt - left.deletedAt);
}

/**
 * The restored records the keyring loads, as a start would: an account record under its current key. A record an
 * ECDSA account had under its account id is stored back but not loaded; the next start sets it aside again
 * (EcdsaAccountRecords.ts), and loading it now would store the older record over the current one.
 */
export function loadableAccountRecords<T>(records: Record<string, T>): [string, T][] {
  return Object.entries(records).filter(([key, record]) => {
    if (!ACCOUNT_RECORD_KEY.test(key) || !isObject(record) || !(record as { encoded?: unknown }).encoded) return false;

    return ecdsaRecordKeys(record)?.legacy !== key;
  });
}
