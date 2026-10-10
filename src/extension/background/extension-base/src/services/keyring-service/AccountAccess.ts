import { isEthereumAddress } from '@polkadot/util-crypto';
import LegacyPasswordPromptStore from '@extension-base/stores/LegacyPasswordPromptStore';
import type { KeyringPair } from '@subwallet/keyring/types';
import type { FWKeyringMeta } from '@extension-base/types';
import type { KeyringService } from '.';
import type {
  AccountAccessIssue,
  AccountAccessStatus,
  LegacyPasswordAccountSummary,
} from '../../background/types/types';
import { WalletEcosystem } from '@/interfaces';
import { isSameString } from '@/helpers';

const LEGACY_PASSWORD_PROMPT_KEY = 'legacyPasswordPrompt';

type KeyringAccount = { address: string; meta: FWKeyringMeta };

// These accounts sign outside the local encrypted keyring and have no stored key to open.
function hasLocalKey(pair: KeyringPair): boolean {
  const meta = pair.meta;
  return !meta.isExternal && !meta.isHardware && !meta.isInjected && !meta.isMobile;
}

export function needsLegacyPasswordMigration(pair: KeyringPair | null | undefined): boolean {
  if (!pair || pair.meta.isMasterPassword) return false;
  // Prompting for an old local password would make the otherwise valid upgrade
  // of an external, hardware, injected or mobile account impossible.
  return hasLocalKey(pair);
}

export function isMasterPasswordPair(pair: KeyringPair | null | undefined): boolean {
  return !!pair?.meta.isMasterPassword && hasLocalKey(pair);
}

export function decodesWithPassword(pair: KeyringPair, password: string): boolean {
  const wasLocked = pair.isLocked;
  try {
    pair.decodePkcs8(password);
    return true;
  } catch {
    return false;
  } finally {
    if (wasLocked) pair.lock();
  }
}

function walletEcosystemOf({ address, meta }: KeyringAccount): WalletEcosystem {
  if (isEthereumAddress(address)) return WalletEcosystem.Evm;
  return (meta.walletEcosystem as WalletEcosystem | undefined) ?? WalletEcosystem.Substrate;
}

function linkedParentOf(address: string, accounts: KeyringAccount[]): KeyringAccount | undefined {
  if (!isEthereumAddress(address)) return undefined;
  return accounts.find(({ address: parent, meta }) =>
    !isEthereumAddress(parent) && isSameString(meta.ethereumAddress as string | undefined, address));
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

/** Plain data for the popup. KeyringPair objects carry functions and typed arrays, which extension
 * messaging cannot serialize ("Could not serialize message" after a 2.6.3 upgrade). Parents come
 * first, each followed by its own pending EVM account, then EVM accounts whose parent no longer
 * needs a password, then standalone EVM imports. */
export function summarizeLegacyPasswordAccounts(pending: KeyringPair[], accounts: KeyringAccount[]): LegacyPasswordAccountSummary[] {
  const summaries = pending.map((pair) => {
    const meta = pair.meta as FWKeyringMeta;
    const isEthereum = isEthereumAddress(pair.address);
    const parent = linkedParentOf(pair.address, accounts);
    const ethereumAddress = meta.ethereumAddress;
    return withoutUndefined<LegacyPasswordAccountSummary>({
      address: pair.address,
      name: typeof meta.name === 'string' ? meta.name : '',
      type: pair.type,
      walletEcosystem: walletEcosystemOf({ address: pair.address, meta }),
      isEthereum,
      linkedParentAddress: parent?.address,
      linkedParentName: parent ? (typeof parent.meta.name === 'string' ? parent.meta.name : '') : undefined,
      ethereumAddress: !isEthereum && typeof ethereumAddress === 'string' && ethereumAddress ? ethereumAddress : undefined,
      whenCreated: typeof meta.whenCreated === 'number' ? meta.whenCreated : undefined,
    });
  });
  const grouped = summaries
    .filter(({ isEthereum }) => !isEthereum)
    .flatMap((parent) => [parent, ...summaries.filter(({ linkedParentAddress }) => linkedParentAddress === parent.address)]);
  const remaining = summaries.filter((summary) => !grouped.includes(summary));
  return [
    ...grouped,
    ...remaining.filter(({ linkedParentAddress }) => linkedParentAddress),
    ...remaining.filter(({ linkedParentAddress }) => !linkedParentAddress),
  ];
}

/** Which accounts cannot be opened with the master password, whether the per-account password prompt
 * is due, and the background check of every TON phrase after unlock. Nothing here deletes an account
 * or a ciphertext. */
export class AccountAccessService {
  /** Local keys that did not open with the current master password, found when they were used. */
  private readonly previousMasterPairs = new Set<string>();
  private readonly promptStore = new LegacyPasswordPromptStore();
  /** The stored "Skip for now" choice once read; the router asks on every navigation. */
  private deferred?: boolean;
  private scanEpoch = 0;
  private scanWork: Promise<void> = Promise.resolve();
  private scanComplete = false;

  constructor(private readonly keyringService: KeyringService) {}

  flagPreviousMasterPair(address: string): void {
    this.previousMasterPairs.add(address);
  }

  clearPreviousMasterPair(address: string): void {
    this.previousMasterPairs.delete(address);
  }

  async isDeferred(): Promise<boolean> {
    if (this.deferred !== undefined) return this.deferred;
    try {
      this.deferred = !!(await this.promptStore.getAndWait(LEGACY_PASSWORD_PROMPT_KEY))?.deferredAt;
      return this.deferred;
    } catch {
      // Unreadable: prompt again and read again next time. "Skip for now" stays available on the prompt.
      return false;
    }
  }

  async defer(): Promise<boolean> {
    // Without a master password the wallet cannot be unlocked at all, so there is nothing to defer to.
    if (!this.keyringService.hasMasterPassword) return false;
    try {
      await this.promptStore.setAndWait(LEGACY_PASSWORD_PROMPT_KEY, { deferredAt: Date.now() });
      this.deferred = true;
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  /** After a wallet reset: forget the deferral and every finding of this session. */
  reset(): void {
    this.cancelScan();
    this.previousMasterPairs.clear();
    this.keyringService.tonKeyring.vault.needsPreviousPassword.clear();
    this.deferred = false;
    this.promptStore.remove(LEGACY_PASSWORD_PROMPT_KEY);
  }

  async getStatus(legacyPairs: KeyringPair[]): Promise<AccountAccessStatus> {
    const hasMasterPassword = this.keyringService.hasMasterPassword;
    const mustCreateMasterPassword = !hasMasterPassword && legacyPairs.length > 0;
    const deferred = hasMasterPassword && (await this.isDeferred());
    // Pending EVM accounts alone never force the prompt (3.0.5 listed only non-EVM accounts there).
    const pendingNonEthereum = legacyPairs.some(({ address }) => !isEthereumAddress(address));
    return {
      hasMasterPassword,
      mustCreateMasterPassword,
      promptPending: mustCreateMasterPassword || (pendingNonEthereum && !deferred),
      deferred,
      issues: this.getIssues(legacyPairs),
      scanComplete: this.scanComplete,
    };
  }

  private getIssues(legacyPairs: KeyringPair[]): AccountAccessIssue[] {
    const accounts = this.keyringService.getAccounts();
    // Same order as the migration list. The original JSON still opens with its old password only,
    // so downloading it changes nothing.
    const legacyIssues = summarizeLegacyPasswordAccounts(legacyPairs, accounts).map(
      ({ address, walletEcosystem, name, linkedParentAddress }) => withoutUndefined<AccountAccessIssue>({
        address, walletEcosystem, kind: 'legacy_account_password', name, linkedParentAddress, canDownloadEncryptedBackup: true,
      })
    );
    const previousMasterIssues = [...this.previousMasterPairs]
      .map((address) => this.keyringService.getPair(address))
      .filter((pair): pair is KeyringPair => isMasterPasswordPair(pair))
      .map((pair) => {
        const meta = pair.meta as FWKeyringMeta;
        return withoutUndefined<AccountAccessIssue>({
          address: pair.address,
          walletEcosystem: walletEcosystemOf({ address: pair.address, meta }),
          kind: 'previous_master_password',
          name: typeof meta.name === 'string' ? meta.name : '',
          linkedParentAddress: linkedParentOf(pair.address, accounts)?.address,
          canDownloadEncryptedBackup: false,
        });
      });
    const { accountSubject, vault } = this.keyringService.tonKeyring;
    const tonAccounts = accountSubject.value;
    const tonIssues = [...vault.needsPreviousPassword]
      .filter((address) => tonAccounts[address])
      .map((address): AccountAccessIssue => ({
        address,
        walletEcosystem: WalletEcosystem.Ton,
        kind: 'previous_master_password',
        name: tonAccounts[address].name ?? '',
        canDownloadEncryptedBackup: false,
      }));
    return [...legacyIssues, ...previousMasterIssues, ...tonIssues];
  }

  /** After unlock or a password change: opens every TON phrase with `password` (about 100 ms each),
   * after the response was delivered. Only the vault's own repairs write. Lock cancels it. */
  scheduleScan(password: string): void {
    if (!password) return;
    const epoch = this.scanEpoch + 1;
    this.scanEpoch = epoch;
    this.scanComplete = false;
    const isCurrent = () => this.scanEpoch === epoch && this.keyringService.getPassword() === password;
    this.scanWork = this.scanWork.catch(() => {}).then(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const tonKeyring = this.keyringService.tonKeyring;
      for (const address of Object.keys(tonKeyring.accountSubject.value)) {
        if (!isCurrent()) return;
        // A phrase that does not open is recorded by the vault as needing a previous password.
        await tonKeyring.vault.decryptVerified(address, () => password, isCurrent).catch(() => {});
      }
      if (isCurrent()) this.scanComplete = true;
    }).catch(() => {});
  }

  cancelScan(): void {
    this.scanEpoch += 1;
    this.scanComplete = false;
  }

  waitForScan(): Promise<void> {
    return this.scanWork;
  }
}
