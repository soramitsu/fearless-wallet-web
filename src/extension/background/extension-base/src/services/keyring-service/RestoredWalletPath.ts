import AccountsStore from '@extension-base/stores/Accounts';
import { accountStorageKey, updateAccountMetadata } from './AccountMetadata';
import {
  probeUniversalWalletLegacyAccounts,
  universalWalletNetworkAddress,
  type UniversalWalletFundsProbe,
} from './UniversalWalletPassword';
import type { KeyringPair, KeyringPair$Json } from '@subwallet/keyring/types';
import type { FWKeyringMeta } from '@extension-base/types';
import { decodeStoredPhraseFromJsonBackup } from '@/util/keyringJson';

/**
 * A wallet restored from a JSON or Google Drive backup whose words did not open its key on their own
 * (JsonAccountImport). Its Bitcoin, Solana, TON and Taira accounts wait until the words are shown to be its root.
 */
export function waitsForDerivationPath(pair: KeyringPair | null | undefined): boolean {
  const meta = pair?.meta as FWKeyringMeta | undefined;

  return !!pair && !!meta?.isMnemonicUnverified && ['sr25519', 'ed25519', 'ethereum'].includes(pair.type) &&
    !!meta.isMasterPassword && !meta.isExternal && !meta.isHardware && !meta.isInjected && !meta.isMobile;
}

/** The stored record of a restored wallet and the words it holds, read with the master password. */
export async function readRestoredWalletPhrase(
  pair: KeyringPair,
  password: string
): Promise<{ snapshot: KeyringPair$Json; phrase: string } | undefined> {
  const snapshot = await new AccountsStore().getAndWait(accountStorageKey(pair));

  if (!snapshot) return undefined;

  try {
    const phrase = decodeStoredPhraseFromJsonBackup(snapshot, password, pair.publicKey);

    return phrase ? { snapshot, phrase } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Records that the words open the restored key, with `additions`. A record that changed meanwhile (another master
 * password, another restore) is left alone. True once the account counts as verified, by this call or an earlier one.
 */
export async function commitRestoredWalletPhrase(
  pair: KeyringPair,
  snapshot: KeyringPair$Json,
  isCurrent: () => boolean,
  additions: FWKeyringMeta = {}
): Promise<boolean> {
  await updateAccountMetadata(pair, (current, json) => json.encoded === snapshot.encoded && current.isMnemonicUnverified
    // false rather than deleted: the live pair merges metadata, so a removed key would keep its old value there.
    ? { ...current, ...additions, isMnemonicUnverified: false, isMasterAccount: true }
    : undefined, isCurrent, false).catch(() => false);

  return !(pair.meta as FWKeyringMeta).isMnemonicUnverified;
}

/**
 * The funds probe for a restored wallet's enrollment: each no-password address of its words is checked once, all at
 * the same time and before anything is written. Other words or addresses still ask the network.
 */
export async function prefetchedFundsProbe(
  probe: UniversalWalletFundsProbe,
  phrase: string
): Promise<UniversalWalletFundsProbe> {
  const probed = await probeUniversalWalletLegacyAccounts(probe, phrase);

  return async (network, mnemonic, fields, passphrase) => {
    const found = probed.find((item) => item.network === network);

    // Only the addresses these words open without a password were checked.
    return found && !passphrase && mnemonic === phrase &&
      universalWalletNetworkAddress(fields as FWKeyringMeta, network) === found.address
      ? found.funds
      : probe(network, mnemonic, fields, passphrase);
  };
}
