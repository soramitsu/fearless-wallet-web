import type { AccountJson } from '@extension-base/background/types/types';
import type { UniversalWalletLegacyVaultDescriptor } from '@/util/universalWalletMigrationContract';
import { ALL_NETWORKS, FAVORITE_NETWORKS, MAIN_NETWORKS, POLKADOT, POPULAR_NETWORKS, TON_MAINNET } from '@/consts/networks';
import {
  UNIVERSAL_WALLET_BITCOIN_NETWORKS,
  UNIVERSAL_WALLET_SOLANA_NETWORKS,
} from '@/consts/universalWallet';
import { WalletEcosystem } from '@/interfaces';

type UniversalWalletLegacyExportTarget = {
  account: AccountJson;
  network: string;
};

const GROUP_NETWORKS = new Set([ALL_NETWORKS, POPULAR_NETWORKS, FAVORITE_NETWORKS]);
const TAIRA_TESTNET_NETWORK_NAME = 'Taira Testnet';

function resolveUniversalWalletLegacyExportTarget(
  vault: UniversalWalletLegacyVaultDescriptor,
  accounts: AccountJson[]
): UniversalWalletLegacyExportTarget | null {
  if (vault.mode !== 'export-only' || !vault.canExportSecrets || vault.canSignTransactions) return null;

  const account = accounts.find((candidate) => isLegacyVaultAccount(candidate, vault));

  if (!account) return null;

  return {
    account,
    network: resolveLegacyExportNetwork(vault, account),
  };
}

function isLegacyVaultAccount(account: AccountJson, vault: UniversalWalletLegacyVaultDescriptor): boolean {
  return [
    account.address,
    account.ethereumAddress,
    account.bitcoinAddress,
    account.bitcoinTestnetAddress,
    account.solanaAddress,
    account.irohaAddress,
  ].some((address) => isSameAddressText(address, vault.address));
}

function resolveLegacyExportNetwork(vault: UniversalWalletLegacyVaultDescriptor, account?: AccountJson): string {
  switch (vault.ecosystem) {
    case WalletEcosystem.Bitcoin:
      return UNIVERSAL_WALLET_BITCOIN_NETWORKS.mainnet.name;
    case WalletEcosystem.Evm:
      return MAIN_NETWORKS.ethereum;
    case WalletEcosystem.Iroha:
      return TAIRA_TESTNET_NETWORK_NAME;
    case WalletEcosystem.Solana:
      return UNIVERSAL_WALLET_SOLANA_NETWORKS.mainnet.name;
    case WalletEcosystem.Ton:
      return TON_MAINNET;
    case WalletEcosystem.Substrate:
    default:
      return isConcreteNetwork(account?.network) ? account!.network! : POLKADOT;
  }
}

function isConcreteNetwork(network: string | undefined): boolean {
  return !!network && !GROUP_NETWORKS.has(network);
}

function isSameAddressText(left: string | undefined, right: string): boolean {
  return left?.toLowerCase() === right.toLowerCase();
}

export { resolveLegacyExportNetwork, resolveUniversalWalletLegacyExportTarget };
export type { UniversalWalletLegacyExportTarget };
