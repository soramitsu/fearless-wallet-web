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

function matchingWallets(accounts: StoredWallet[], address: string): StoredWallet[] {
  const requestedIrohaKey = irohaPublicKey(address);
  return accounts.filter((account) => [
    account.address, account.meta.ethereumAddress, account.meta.solanaAddress,
    account.meta.tonAddress, account.meta.irohaAddress,
  ].some((candidate) => typeof candidate === 'string' && candidate && sameAddress(candidate, address)) ||
    (requestedIrohaKey && typeof account.meta.irohaPublicKeyHex === 'string' &&
      requestedIrohaKey === account.meta.irohaPublicKeyHex.replace(/^0x/i, '').toLowerCase()));
}

// Polkaswap's account migration asks for the old account; no other site may be shown an existing or imported wallet.
const RECOVERY_CONNECTION_ORIGINS = new Set(['https://polkaswap.io']);

/** Whether the page at `url` (or a grant's origin) may be offered and connected existing or imported wallets. */
export function siteMayConnectRecoveryWallets(url: string): boolean {
  try { return RECOVERY_CONNECTION_ORIGINS.has(new URL(url).origin); } catch { return false; }
}

/** Sharing an approved public account does not authorize signing with its keys. */
export function assertWalletAllowsConnection(accounts: StoredWallet[], address: string, url: string): void {
  const matches = matchingWallets(accounts, address);
  if (!address || matches.length === 0) {
    throw new Error('The requested wallet is not available');
  }
  if (matches.some(({ meta }) => isRecoveryOnlyWallet(meta)) && !siteMayConnectRecoveryWallets(url)) {
    throw new Error(WALLET_RECOVERY_ONLY_ERROR);
  }
}

/** Check the requested signer, never just the currently selected wallet. */
export function assertWalletAllowsNormalUse(accounts: StoredWallet[], address: string): void {
  const matches = matchingWallets(accounts, address);
  if (!address || matches.length === 0 || matches.some(({ meta }) => isRecoveryOnlyWallet(meta))) {
    throw new Error(WALLET_RECOVERY_ONLY_ERROR);
  }
}

const recoveryRoutes = new Set([
  // Approval screens review their own accounts. The background enforces signing restrictions
  // on the requested signer, independently of the portfolio's selected recovery-only wallet.
  'Authorize', 'Transaction',
  'Wallet', 'Currencies', 'Nfts', 'Asset', 'AssetHistory', 'AssetNetworks',
  'NftCollection', 'NftDetails', 'NftSendForm', 'SendForm',
  'Defi', 'Staking', 'MyStake', 'Pools', 'PoolDetails', 'Farming', 'Polkamarkt',
  'AccountsLayout', 'ChainAccounts', 'AccountSetting', 'Export',
  'Settings', 'SettingsNetworksAssets', 'SettingsChangePassword', 'Nodes',
  'ManageAuths', 'DAppDetails', 'DAppsAuths', 'WcAuths', 'WalletConnectAuthDetails',
  'AddWallet', 'AddFromGoogle', 'CreateGoogle', 'MobileWalletAuth',
  'ChangePassword', 'Unlock', 'Welcome', 'Onboarding', 'ResetWallet',
  'MigrationDescription', 'MigrationAccounts', 'UniversalWalletMigration',
  'AccountAccessRecovery', 'StorageRecovery',
  'SecurityNotice', 'SecurityNoticeGuide',
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
