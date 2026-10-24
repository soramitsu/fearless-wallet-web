import AccountsStore from '@extension-base/stores/Accounts';
import { accountStorageKey, isCurrentAccountPair, updateAccountMetadata } from './AccountMetadata';
import type { KeyringPair } from '@subwallet/keyring/types';
import type { FWKeyringMeta } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { decodeMnemonicFromJsonBackup } from '@/util/keyringJson';
import { deriveBitcoinReceiveAddress } from '@/util/bitcoinKeyring';
import { deriveSolanaAddress } from '@/util/solanaKeyring';
import { deriveTonAccount } from '@/util/tonKeyring';
import { deriveIrohaAddress } from '@/util/irohaKeyring';
import { buildUniversalWalletKeyringMeta } from '@/util/universalWalletKeyringMeta';

type Network = {
  keys: (keyof FWKeyringMeta)[];
  ecosystem: WalletEcosystem;
  chainId?: string;
  derive: (mnemonic: string) => Partial<FWKeyringMeta>;
};

const networks: Network[] = [
  { keys: ['bitcoinAddress'], ecosystem: WalletEcosystem.Bitcoin, chainId: 'bitcoin:mainnet',
    derive: (mnemonic) => ({ bitcoinAddress: deriveBitcoinReceiveAddress({ mnemonicOrSeed: mnemonic }) }) },
  { keys: ['bitcoinTestnetAddress'], ecosystem: WalletEcosystem.Bitcoin, chainId: 'bitcoin:testnet',
    derive: (mnemonic) => ({ bitcoinTestnetAddress: deriveBitcoinReceiveAddress({ mnemonicOrSeed: mnemonic, network: 'testnet' }) }) },
  { keys: ['solanaAddress'], ecosystem: WalletEcosystem.Solana,
    derive: (mnemonic) => ({ solanaAddress: deriveSolanaAddress({ mnemonic }) }) },
  { keys: ['tonAddress', 'tonPublicKeyHex'], ecosystem: WalletEcosystem.Ton,
    derive: (mnemonic) => {
      const ton = deriveTonAccount({ mnemonic });
      return { tonAddress: ton.addressNonBounceable, tonPublicKeyHex: ton.publicKeyHex };
    } },
  { keys: ['irohaAddress', 'irohaPublicKeyHex'], ecosystem: WalletEcosystem.Iroha,
    derive: (mnemonic) => {
      const iroha = deriveIrohaAddress({ mnemonic, network: 'taira' });
      return { irohaAddress: iroha.address, irohaPublicKeyHex: iroha.publicKeyHex };
    } },
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
    !meta.isExternal && !meta.isHardware && !meta.isInjected && !meta.isMobile &&
    networks.some((network) => !hasNetwork(meta, network));
}

export async function enrollLegacyAccountNetworks(
  pair: KeyringPair,
  password: string,
  isCurrent: () => boolean,
  yieldToWallet: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 0))
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
      const additions = network.derive(mnemonic);
      await updateAccountMetadata(pair, (current, json) => {
        // Password changes, deletion/reimport and another enrollment invalidate
        // this snapshot; a later unlock can retry from the authoritative record.
        if (json.encoded !== snapshot.encoded || hasNetwork(current, network)) return;
        const meta = { ...current, ...additions };
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
