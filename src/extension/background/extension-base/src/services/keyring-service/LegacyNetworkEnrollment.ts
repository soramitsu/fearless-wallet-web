import AccountsStore from '@extension-base/stores/Accounts';
import { accountStorageKey, isCurrentAccountPair, updateAccountMetadata } from './AccountMetadata';
import type { KeyringPair } from '@subwallet/keyring/types';
import type { FWKeyringMeta } from '@extension-base/types';
import type { UniversalWalletFundsProbe } from './UniversalWalletPassword';
import { WalletEcosystem } from '@/interfaces';
import { decodeMnemonicFromJsonBackup } from '@/util/keyringJson';
import { deriveUniversalWalletNetworkFields, universalWalletNetworkKeys } from '@/util/universalWalletKeyringFields';
import { buildUniversalWalletKeyringMeta } from '@/util/universalWalletKeyringMeta';
import { universalWalletLegacyNetworks, type UniversalWalletPasswordNetwork } from '@/util/universalWalletPassphrase';

type Network = {
  id: UniversalWalletPasswordNetwork;
  keys: (keyof FWKeyringMeta)[];
  ecosystem: WalletEcosystem;
  chainId?: string;
};

type EnrollmentOptions = {
  /** The wallet password ('' when it has none), asked when a network is about to be added. */
  passphrase?: () => string;
  probe?: UniversalWalletFundsProbe;
};

const networks: Network[] = [
  { id: 'bitcoin', keys: universalWalletNetworkKeys('bitcoin'), ecosystem: WalletEcosystem.Bitcoin, chainId: 'bitcoin:mainnet' },
  { id: 'bitcoinTestnet', keys: universalWalletNetworkKeys('bitcoinTestnet'), ecosystem: WalletEcosystem.Bitcoin,
    chainId: 'bitcoin:testnet' },
  { id: 'solana', keys: universalWalletNetworkKeys('solana'), ecosystem: WalletEcosystem.Solana },
  { id: 'ton', keys: universalWalletNetworkKeys('ton'), ecosystem: WalletEcosystem.Ton },
  { id: 'iroha', keys: universalWalletNetworkKeys('iroha'), ecosystem: WalletEcosystem.Iroha },
];

function hasNetwork(meta: FWKeyringMeta, network: Network): boolean {
  if (meta.walletEcosystem === network.ecosystem) return true;
  if (network.keys.some((key) => !!meta[key])) return true;
  const accounts = meta.universalWallet?.publicAccounts;
  return Array.isArray(accounts) && accounts.some((account) => account?.ecosystem === network.ecosystem &&
    (!network.chainId || !account.chainId || account.chainId === network.chainId));
}

export function needsLegacyNetworkEnrollment(pair: KeyringPair): boolean {
  const meta = pair.meta as FWKeyringMeta;
  // Native TON phrases, raw keys and remotely signing accounts do not establish
  // a BIP39 root. Existing local account encryption is never replaced here.
  return ['sr25519', 'ed25519', 'ethereum'].includes(pair.type) && !!meta.isMasterPassword &&
    !meta.isMnemonicUnverified &&
    !meta.isExternal && !meta.isHardware && !meta.isInjected && !meta.isMobile &&
    networks.some((network) => !hasNetwork(meta, network));
}

export async function enrollLegacyAccountNetworks(
  pair: KeyringPair,
  password: string,
  isCurrent: () => boolean,
  yieldToWallet: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 0)),
  { passphrase: walletPassphrase = () => '', probe }: EnrollmentOptions = {}
): Promise<void> {
  if (!needsLegacyNetworkEnrollment(pair) || !isCurrent() || !isCurrentAccountPair(pair)) return;
  const store = new AccountsStore();
  const snapshot = await store.getAndWait(accountStorageKey(pair));
  if (!snapshot || !isCurrent() || !isCurrentAccountPair(pair)) return;
  const mnemonic = decodeMnemonicFromJsonBackup(snapshot, password, pair.publicKey);
  if (!mnemonic) return;

  for (const network of networks) {
    await yieldToWallet();
    if (!isCurrent() || !isCurrentAccountPair(pair)) return;
    if (hasNetwork(pair.meta as FWKeyringMeta, network)) continue;
    try {
      // A password wallet gains the protected account, unless the address its words alone open holds funds or
      // cannot be checked: that one stays visible (and listed as legacy) until it is moved.
      const passphrase = walletPassphrase();
      const legacy = !!passphrase &&
        (await probe?.(network.id, mnemonic, deriveUniversalWalletNetworkFields(network.id, mnemonic, '')) ?? 'unknown') !== 'empty';
      if (!isCurrent() || !isCurrentAccountPair(pair)) return;
      const additions = deriveUniversalWalletNetworkFields(network.id, mnemonic, legacy ? '' : passphrase);
      await updateAccountMetadata(pair, (current, json) => {
        // Password changes, deletion/reimport and another enrollment invalidate
        // this snapshot; a later unlock can retry from the authoritative record.
        if (json.encoded !== snapshot.encoded || hasNetwork(current, network)) return;
        const meta: FWKeyringMeta = { ...current, ...additions };
        const legacyNetworks = universalWalletLegacyNetworks(current.universalWalletLegacyNetworks);
        if (legacy) meta.universalWalletLegacyNetworks = [...legacyNetworks, network.id];
        const walletEcosystem = meta.walletEcosystem ??
          (pair.type === 'ethereum' ? WalletEcosystem.Evm : WalletEcosystem.Substrate);
        return { ...meta, walletEcosystem, universalWallet: buildUniversalWalletKeyringMeta({
          address: pair.address, meta, walletEcosystem, source: 'legacy-import',
        }) };
      }, isCurrent, false);
    } catch {
      // Each absent network is optional and independently retryable. Do not
      // poison unlock, the account-write flush, or other networks on failure.
    }
  }
}
