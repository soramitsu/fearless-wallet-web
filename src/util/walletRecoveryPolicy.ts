import { decodeAddress } from '@polkadot/util-crypto';
import { u8aEq } from '@polkadot/util';
import { isRecoveryOnlyWallet, type WalletSecurityMetadata } from '@/util/walletSecurity';
import { parseIrohaI105Address } from '@/util/iroha';

export const WALLET_RECOVERY_ONLY_ERROR = 'This wallet is recovery-only after a security issue. Create a new wallet with a new recovery phrase. Only transfers out, unstaking, withdrawals, claims and backup exports are available.';

type StoredWallet = {
  address: string;
  meta: WalletSecurityMetadata & {
    ethereumAddress?: unknown;
    solanaAddress?: unknown;
    tonAddress?: unknown;
    irohaAddress?: unknown;
    irohaPublicKeyHex?: unknown;
  };
};

function irohaPublicKey(address: string): string | undefined {
  try { return parseIrohaI105Address(address).publicKeyHex; } catch { return undefined; }
}

function sameAddress(left: string, right: string): boolean {
  if (left === right) return true;
  if (/^0x[0-9a-f]{40}$/i.test(left) && /^0x[0-9a-f]{40}$/i.test(right)) {
    return left.toLowerCase() === right.toLowerCase();
  }
  const irohaKey = irohaPublicKey(left);
  if (irohaKey) return irohaKey === irohaPublicKey(right);
  try { return u8aEq(decodeAddress(left), decodeAddress(right)); } catch { return false; }
}

/** Check the requested signer, never just the currently selected wallet. */
export function assertWalletAllowsNormalUse(accounts: StoredWallet[], address: string): void {
  const requestedIrohaKey = irohaPublicKey(address);
  const matches = accounts.filter((account) => [
    account.address, account.meta.ethereumAddress, account.meta.solanaAddress,
    account.meta.tonAddress, account.meta.irohaAddress,
  ].some((candidate) => typeof candidate === 'string' && candidate && sameAddress(candidate, address)) ||
    (requestedIrohaKey && typeof account.meta.irohaPublicKeyHex === 'string' &&
      requestedIrohaKey === account.meta.irohaPublicKeyHex.replace(/^0x/i, '').toLowerCase()));
  if (!address || matches.length === 0 || matches.some(({ meta }) => isRecoveryOnlyWallet(meta))) {
    throw new Error(WALLET_RECOVERY_ONLY_ERROR);
  }
}

const recoveryRoutes = new Set([
  'Wallet', 'Currencies', 'Nfts', 'Asset', 'AssetHistory', 'AssetNetworks',
  'NftCollection', 'NftDetails', 'NftSendForm', 'SendForm',
  'Defi', 'Staking', 'MyStake', 'Pools', 'PoolDetails', 'Farming', 'Polkamarkt',
  'AccountsLayout', 'ChainAccounts', 'AccountSetting', 'Export',
  'Settings', 'SettingsNetworksAssets', 'SettingsChangePassword', 'Nodes',
  'ManageAuths', 'DAppDetails', 'DAppsAuths', 'WcAuths', 'WalletConnectSessionDetails',
  'AddWallet', 'AddFromGoogle', 'CreateGoogle', 'MobileWalletAuth',
  'ChangePassword', 'Unlock', 'Welcome', 'Onboarding', 'ResetWallet',
  'MigrationDescription', 'MigrationAccounts', 'UniversalWalletMigration',
]);

export function isWalletRecoveryRoute(name: unknown): boolean {
  return typeof name === 'string' && recoveryRoutes.has(name);
}

export function isSelectedWalletRecoveryOnly(
  accounts: Array<WalletSecurityMetadata & { address: string; active?: boolean }>,
  address: string
): boolean {
  const selected = accounts.find((account) => account.address === address) ?? accounts.find((account) => account.active);
  return selected ? isRecoveryOnlyWallet(selected) : accounts.some(isRecoveryOnlyWallet);
}
