import { isEthereumAddress } from '@polkadot/util-crypto';
import type { KeyringService } from '@extension-base/services/keyring-service';
import type { FWKeyringMeta } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { isSameString } from '@/helpers';

export const LEGACY_EXPOSURE_RECORD_VERSION = 1;

/**
 * What a 3.0.x build left in storage. The master password arrived with 3.0.1 and its record is the
 * one trace every exposed profile has: those builds could only read a phrase after an unlock.
 * TON accounts arrived with 3.0.1 too and survive a wallet reset. `sentMarker` is the `myAddresses`
 * list 3.0.3-3.0.5 wrote before each upload attempt; it was written before the request was sent
 * and 3.0.1 wrote nothing, so it proves neither delivery nor safety and is never used alone.
 */
export type LegacyExposureEvidence = 'masterPassword' | 'tonAccount' | 'sentMarker';

export interface LegacyExposureAccount {
  address: string;
  walletEcosystem: WalletEcosystem;
  name: string;
  /** The Substrate account this EVM account was shown with when the baseline was taken. */
  linkedParentAddress?: string;
}

/** `legacyExposure` in wallet storage. Written once, on the first start of a build that has the
 * notice, before that build can add an account; later starts only read it. */
export interface LegacyExposureRecord {
  version: typeof LEGACY_EXPOSURE_RECORD_VERSION;
  recordedAt: number;
  evidence: LegacyExposureEvidence[];
  /** Every account with a locally stored key that existed at `recordedAt`. Empty when no trace of
   * 3.0.x was found, and then nothing is shown. */
  accounts: LegacyExposureAccount[];
  acknowledgedAt?: number;
  backupConfirmedAt?: number;
  /** The user's own "moved" marks, by wallet address. The app does not verify them. */
  movedAt?: Record<string, number>;
}

export interface LegacyExposureWallet {
  address: string;
  walletEcosystem: WalletEcosystem;
  name: string;
  /** False once the wallet was removed from this app. Its phrase stays possibly exposed. */
  present: boolean;
  movedAt?: number;
}

export interface LegacyExposureNewWallet {
  address: string;
  walletEcosystem: WalletEcosystem;
  name: string;
}

export interface LegacyExposureStatus {
  /** `unknown`: the record could not be read. Nothing is shown and no network is enrolled; the
   * next request reads again. */
  state: 'unknown' | 'not_exposed' | 'notice_pending' | 'acknowledged';
  wallets: LegacyExposureWallet[];
  /** Wallets with a local key that are not in the baseline: created or added after the update. */
  newWallets: LegacyExposureNewWallet[];
  acknowledgedAt?: number;
  backupConfirmedAt?: number;
}

export interface RequestUpdateLegacyExposure {
  backupConfirmed?: boolean;
  moved?: { address: string; moved: boolean };
}

type LegacyExposureStorage = {
  read: () => Promise<unknown>;
  write: (record: LegacyExposureRecord) => Promise<void>;
  /** The value 3.0.3-3.0.5 stored under `myAddresses`; absent in the web wallet. */
  readSentMarker: () => Promise<unknown>;
};

const isRecordLike = (value: unknown): value is { version: unknown } =>
  !!value && typeof value === 'object' && 'version' in value;

function isRecord(value: unknown): value is LegacyExposureRecord {
  if (!isRecordLike(value) || value.version !== LEGACY_EXPOSURE_RECORD_VERSION) return false;
  const { accounts, evidence, recordedAt } = value as Partial<LegacyExposureRecord>;
  return (
    typeof recordedAt === 'number' &&
    Array.isArray(evidence) &&
    Array.isArray(accounts) &&
    accounts.every((account) => !!account && typeof account.address === 'string' && !!account.address)
  );
}

// EVM addresses are stored lower-cased by the keyring and shown checksummed.
const sameAddress = (left: string, right: string): boolean =>
  left === right || (isEthereumAddress(left) && isEthereumAddress(right) && isSameString(left, right));

const hasLocalKey = (meta: FWKeyringMeta): boolean =>
  !meta.isExternal && !meta.isHardware && !meta.isInjected && !meta.isMobile;

const nameOf = (meta: FWKeyringMeta): string => (typeof meta.name === 'string' ? meta.name : '');

/**
 * Published 3.0.1 and 3.0.3-3.0.5 sent each account's recovery phrase (for JSON and raw-seed
 * accounts the encrypted key with the master password) to an outside server on unlock. Whether a
 * given phrase was delivered cannot be told from the device, so every account that was here before
 * the update is treated as possibly exposed: the user is told once, guided to a new wallet, and no
 * new network address is attached to such an account before the notice is acknowledged.
 *
 * Nothing here deletes or rewrites an account. A failure in this service never keeps the wallet
 * from starting, unlocking or signing.
 */
export class LegacyExposureService {
  private record?: LegacyExposureRecord;
  private persisted = false;
  /** A record written by a later format. It is left as it is and nothing is shown. */
  private foreignRecord = false;
  private loading?: Promise<void>;

  constructor(
    private readonly keyringService: KeyringService,
    private readonly storage: LegacyExposureStorage,
    private readonly now = Date.now
  ) {
    keyringService.setLegacyNetworkEnrollmentGate((address) => this.isEnrollmentAllowed(address));
  }

  /** Start-up calls this once the accounts, the TON accounts and the master-password record are in
   * memory and before any request is answered, so the baseline holds only what earlier builds
   * wrote. It never rejects; a failed read or write is retried by the next call. */
  init(): Promise<void> {
    this.loading ??= this.load()
      .catch((error) => console.error('Security notice state could not be loaded', error))
      .finally(() => (this.loading = undefined));

    return this.loading;
  }

  private async load(): Promise<void> {
    if (this.foreignRecord) return;

    if (!this.record) {
      const stored = await this.storage.read();

      if (isRecord(stored)) {
        this.record = stored;
        this.persisted = true;
      } else if (isRecordLike(stored) && typeof stored.version === 'number') {
        this.foreignRecord = true;

        return;
      } else {
        this.record = await this.takeBaseline();
      }

      // Enrollment was held back while the record was unknown.
      this.keyringService.resumeLegacyNetworkEnrollment();
    }

    if (!this.persisted) await this.persist();
  }

  private async takeBaseline(): Promise<LegacyExposureRecord> {
    const accounts = this.localKeyAccounts();
    const evidence: LegacyExposureEvidence[] = [];

    if (this.keyringService.hasMasterPassword) evidence.push('masterPassword');
    if (Object.keys(this.keyringService.tonKeyring.accountSubject.value).length > 0) evidence.push('tonAccount');
    if (await this.hasSentMarker()) evidence.push('sentMarker');

    return {
      version: LEGACY_EXPOSURE_RECORD_VERSION,
      recordedAt: this.now(),
      evidence,
      accounts: evidence.length > 0 ? accounts : [],
    };
  }

  private async hasSentMarker(): Promise<boolean> {
    try {
      const marker = await this.storage.readSentMarker();

      return Array.isArray(marker) && marker.length > 0;
    } catch {
      return false;
    }
  }

  /** Accounts whose key is stored here. Watch-only, hardware, injected and mobile accounts hold no
   * phrase a 3.0.x build could have read. */
  private localKeyAccounts(): LegacyExposureAccount[] {
    const keyringAccounts = this.keyringService.getAccounts().filter(({ meta }) => hasLocalKey(meta));
    const accounts = keyringAccounts.map(({ address, meta }): LegacyExposureAccount => {
      const isEthereum = isEthereumAddress(address);
      const parent = isEthereum
        ? keyringAccounts.find(
            (candidate) =>
              !isEthereumAddress(candidate.address) &&
              isSameString(candidate.meta.ethereumAddress as string | undefined, address)
          )
        : undefined;

      return {
        address,
        walletEcosystem: isEthereum ? WalletEcosystem.Evm : meta.walletEcosystem ?? WalletEcosystem.Substrate,
        name: nameOf(meta),
        ...(parent ? { linkedParentAddress: parent.address } : {}),
      };
    });
    const tonAccounts = Object.values(this.keyringService.tonKeyring.accountSubject.value).map(
      ({ address, name }): LegacyExposureAccount => ({
        address,
        walletEcosystem: WalletEcosystem.Ton,
        name: name ?? '',
      })
    );

    return [...accounts, ...tonAccounts];
  }

  private async persist(): Promise<boolean> {
    if (!this.record) return false;

    try {
      await this.storage.write(this.record);
      this.persisted = true;
    } catch (error) {
      // The in-memory record keeps applying; the next request writes it again.
      this.persisted = false;
      console.error('Security notice state could not be saved', error);
    }

    return this.persisted;
  }

  private isExposed(address: string): boolean {
    return !!this.record?.accounts.some((account) => sameAddress(account.address, address));
  }

  /** New network addresses are not attached to a possibly exposed account until the user has
   * acknowledged the notice. While the record is unknown nothing is enrolled. */
  isEnrollmentAllowed(address: string): boolean {
    if (!this.record) return false;

    return !!this.record.acknowledgedAt || !this.isExposed(address);
  }

  async getStatus(): Promise<LegacyExposureStatus> {
    await this.init();

    return this.status;
  }

  /** Recorded even when storage refuses the write, so a storage fault cannot keep the user on the
   * notice; it is written again by the next request and asked again only after a restart. */
  async acknowledge(): Promise<LegacyExposureStatus> {
    await this.init();

    if (this.record && this.record.accounts.length > 0 && !this.record.acknowledgedAt) {
      this.record = { ...this.record, acknowledgedAt: this.now() };
      await this.persist();
      this.keyringService.resumeLegacyNetworkEnrollment();
    }

    return this.status;
  }

  async update({ backupConfirmed, moved }: RequestUpdateLegacyExposure): Promise<LegacyExposureStatus> {
    await this.init();

    const record = this.record;

    if (!record || record.accounts.length === 0) return this.status;

    let next = record;

    if (backupConfirmed !== undefined && backupConfirmed !== !!record.backupConfirmedAt) {
      const { backupConfirmedAt: _removed, ...rest } = next;

      next = backupConfirmed ? { ...next, backupConfirmedAt: this.now() } : rest;
    }

    const wallet = moved && this.walletAccounts(record).find(({ address }) => sameAddress(address, moved.address));

    if (moved && wallet && moved.moved !== !!record.movedAt?.[wallet.address]) {
      const movedAt = { ...(next.movedAt ?? {}) };

      if (moved.moved) movedAt[wallet.address] = this.now();
      else delete movedAt[wallet.address];

      next = { ...next, movedAt };
    }

    if (next !== record) {
      this.record = next;
      await this.persist();
    }

    return this.status;
  }

  /** One entry per wallet as the wallet list shows it: a linked EVM account belongs to its parent. */
  private walletAccounts(record: LegacyExposureRecord): LegacyExposureAccount[] {
    return record.accounts.filter(
      ({ linkedParentAddress }) =>
        !linkedParentAddress || !record.accounts.some(({ address }) => address === linkedParentAddress)
    );
  }

  /** The wallet's name now, or `undefined` once it was removed from this app. */
  private currentName(account: LegacyExposureAccount): string | undefined {
    if (account.walletEcosystem === WalletEcosystem.Ton) {
      const tonAccount = this.keyringService.tonKeyring.accountSubject.value[account.address];

      return tonAccount ? (tonAccount.name ?? '') : undefined;
    }

    const pair = this.keyringService.getPair(account.address);

    return pair ? nameOf(pair.meta as FWKeyringMeta) : undefined;
  }

  private get newWallets(): LegacyExposureNewWallet[] {
    const tonAccounts = this.keyringService.tonKeyring.accountSubject.value;

    return this.keyringService
      .getAllMainAccounts()
      .filter(({ address, meta }) => {
        if (this.isExposed(address)) return false;
        if (tonAccounts[address]) return true;

        return !!this.keyringService.getPair(address) && hasLocalKey(meta as FWKeyringMeta);
      })
      .map(({ address, meta }) => ({
        address,
        walletEcosystem: tonAccounts[address]
          ? WalletEcosystem.Ton
          : ((meta as FWKeyringMeta).walletEcosystem ?? WalletEcosystem.Substrate),
        name: nameOf(meta as FWKeyringMeta),
      }));
  }

  get status(): LegacyExposureStatus {
    const record = this.record;

    if (!record) return { state: 'unknown', wallets: [], newWallets: [] };
    if (record.accounts.length === 0) return { state: 'not_exposed', wallets: [], newWallets: [] };

    const wallets = this.walletAccounts(record).map((account): LegacyExposureWallet => {
      const name = this.currentName(account);
      const movedAt = record.movedAt?.[account.address];

      return {
        address: account.address,
        walletEcosystem: account.walletEcosystem,
        name: name ?? account.name,
        present: name !== undefined,
        ...(movedAt ? { movedAt } : {}),
      };
    });

    return {
      state: record.acknowledgedAt ? 'acknowledged' : 'notice_pending',
      wallets,
      newWallets: this.newWallets,
      ...(record.acknowledgedAt ? { acknowledgedAt: record.acknowledgedAt } : {}),
      ...(record.backupConfirmedAt ? { backupConfirmedAt: record.backupConfirmedAt } : {}),
    };
  }
}
