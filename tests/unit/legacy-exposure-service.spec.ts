import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import bcrypt from 'bcryptjs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// @subwallet/keyring needs Cardano WASM the unit environment cannot load. @polkadot/keyring reads
// the same encrypted JSON and gives the same addresses, so the stored accounts below are loaded
// and opened for real; only the ui-keyring bookkeeping is a stand-in.
const mocks = vi.hoisted(() => ({
  backend: undefined as unknown as Keyring,
  hash: '',
  master: '',
  enroll: vi.fn(),
}));
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {
  keyring: {
    get hasMasterPassword() { return !!mocks.hash; },
    get isLocked() { return !mocks.master; },
  },
  getPair: (address: string) => mocks.backend.getPair(address),
  getAccounts: () => mocks.backend.getPairs().map(({ address, meta }) => ({ address, meta })),
  getAddresses: () => [],
  unlockKeyring: (password: string) => {
    if (!mocks.hash || !bcrypt.compareSync(password, mocks.hash)) throw new Error('Invalid master password');
    mocks.master = password;
  },
  lockAll: () => { mocks.master = ''; },
} }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@extension-base/stores/Accounts', () => ({ default: class {} }));
vi.mock('@extension-base/stores/CurrentAccountStore', () => ({ default: class {} }));
vi.mock('@extension-base/stores/KeyringStore', () => ({ default: class {} }));
vi.mock('@extension-base/stores/KeyringStoreWeb', () => ({ default: class {} }));
vi.mock('@extension-base/stores/LegacyPasswordPromptStore', () => ({ default: class {
  getAndWait = async () => undefined;
} }));
vi.mock('@extension-base/services/keyring-service/TonKeyring', () => ({ TonKeyringService: class {} }));
vi.mock('@extension-base/services/keyring-service/LegacyNetworkEnrollment', () => ({
  enrollLegacyAccountNetworks: mocks.enroll,
}));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
// Extension is exercised through its prototype; its services are never built.
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));

import { KeyringService } from '@extension-base/services/keyring-service';
import {
  LegacyExposureService,
  type LegacyExposureRecord,
} from '@extension-base/services/legacy-exposure-service';
import Extension from '@extension-base/background/handlers/Extension';
import type { KeyringPair$Json } from '@polkadot/keyring/types';

type StoredTonAccount = { address: string; name: string; cipherSeed: string; publicKeyHex: string };
type Storage = Record<string, unknown>;
type Fixture = { provenance: Record<string, unknown>; storage: Storage };

// chrome.storage.local as released builds left it (see tests/fixtures/upgrade/README.md): real
// 3.0.5 and 2.6.3 builds wrote these records in Chrome; nothing in them was written by this code.
const fixture = (name: string): Fixture =>
  JSON.parse(readFileSync(resolve(__dirname, `../fixtures/upgrade/${name}.storage.json`), 'utf8')) as Fixture;

const MASTER_305 = fixture('chrome-3.0.5-master-password');
const CHANGED_305 = fixture('chrome-3.0.5-password-changed');
const ACCOUNT_PASSWORDS_263 = fixture('chrome-2.6.3-account-passwords');

const SUBSTRATE = '5EPCUjPxiHAcNooYipQFWr9NmmXJKpNG5RhcntXwbtUySrgH';
const EVM = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const TON_NATIVE = 'UQCG65A1CoCyKH3Xet8GNkEcfyGiZolh2DG2zc8rXRVHSPJ0';
const TON_BIP39 = 'UQC-UdqQ66NWBZO-TGQ3YBfis8kz37HNFju2aKWBNESTSb44';
// A public test phrase; never fund it.
const NEW_MNEMONIC = 'letter advice cage absurd amount doctor acoustic avoid letter advice cage above';
const NOW = 1_800_000_000_000;

// The wallet as the background holds it after start-up read `storage`.
function load(storage: Storage) {
  mocks.backend = new Keyring({ type: 'sr25519' });
  mocks.hash = (storage['fw:keyring'] as { passwordHash: string } | undefined)?.passwordHash ?? '';
  mocks.master = '';

  for (const [key, value] of Object.entries(storage)) {
    if (key.startsWith('fw:account:')) mocks.backend.addFromJson(value as KeyringPair$Json);
  }

  const tonAccounts = Object.fromEntries(
    Object.entries(storage)
      .filter(([key]) => key.startsWith('fw:ton:'))
      .map(([, value]) => {
        const { address, name } = value as StoredTonAccount;
        return [address, { address, name, walletEcosystem: 'ton', json: { address, meta: { name } } }];
      })
  );
  const tonKeyring = {
    accountSubject: { value: tonAccounts },
    getAccounts: () => Object.values(tonAccounts).map(({ address, name }) => ({
      address, walletEcosystem: 'ton', meta: { name, walletEcosystem: 'ton', isMobile: false },
    })),
    vault: { needsPreviousPassword: new Set<string>(), decryptVerified: async () => '' },
  };
  const keyringService = Object.create(KeyringService.prototype) as KeyringService;
  Object.defineProperty(keyringService, 'tonKeyring', { value: tonKeyring });

  const store = structuredClone(storage);
  const io = {
    read: vi.fn(async () => store.legacyExposure),
    write: vi.fn(async (record: LegacyExposureRecord) => { store.legacyExposure = structuredClone(record); }),
    readSentMarker: vi.fn(async () => store.myAddresses),
  };
  const start = () => new LegacyExposureService(keyringService, io, () => NOW);

  return { keyringService, tonAccounts, store, io, start, exposure: start() };
}

const record = (store: Storage) => store.legacyExposure as LegacyExposureRecord;
const enrolled = () => mocks.enroll.mock.calls.map(([pair]) => (pair as { address: string }).address);

beforeAll(async () => {
  await cryptoWaitReady();
});

beforeEach(() => {
  mocks.enroll.mockReset().mockResolvedValue(undefined);
});

describe('possible exposure after an update from 3.0.x', () => {
  it('lists every wallet a real 3.0.5 profile holds, without the 3.0.3-3.0.5 marker', async () => {
    const { exposure, store, io } = load(MASTER_305.storage);
    expect(store.myAddresses).toBeUndefined();

    await exposure.init();

    expect(await exposure.getStatus()).toEqual({
      state: 'notice_pending',
      wallets: [
        { address: SUBSTRATE, walletEcosystem: 'substrate', name: 'Main', present: true },
        { address: TON_BIP39, walletEcosystem: 'ton', name: 'TON from BIP39', present: true },
        { address: TON_NATIVE, walletEcosystem: 'ton', name: 'TON native', present: true },
      ],
      newWallets: [],
    });
    // The linked EVM account is part of the record even though the list shows it with its parent.
    expect(record(store)).toEqual({
      version: 1,
      recordedAt: NOW,
      evidence: ['masterPassword', 'tonAccount'],
      accounts: [
        { address: SUBSTRATE, walletEcosystem: 'substrate', name: 'Main' },
        { address: EVM, walletEcosystem: 'evm', name: 'Main', linkedParentAddress: SUBSTRATE },
        { address: TON_BIP39, walletEcosystem: 'ton', name: 'TON from BIP39' },
        { address: TON_NATIVE, walletEcosystem: 'ton', name: 'TON native' },
      ],
    });
    expect(io.write).toHaveBeenCalledOnce();
  });

  it('lists them for the profile whose master password was changed inside 3.0.5', async () => {
    const { exposure } = load(CHANGED_305.storage);

    const status = await exposure.getStatus();

    expect(status.state).toBe('notice_pending');
    expect(status.wallets.map(({ name }) => name).sort()).toEqual(['Main', 'TON from BIP39', 'TON native']);
  });

  it('shows nothing for a real 2.6.3 profile that no 3.0.x build could unlock', async () => {
    const { exposure, store, keyringService } = load(ACCOUNT_PASSWORDS_263.storage);
    expect(keyringService.getAccounts()).toHaveLength(2);

    expect(await exposure.getStatus()).toEqual({ state: 'not_exposed', wallets: [], newWallets: [] });
    expect(record(store)).toEqual({ version: 1, recordedAt: NOW, evidence: [], accounts: [] });

    // Setting a master password in this version does not turn these accounts into exposed ones.
    mocks.hash = bcrypt.hashSync('a master password set in 4.2.0', 4);
    expect((await load(store).exposure.getStatus()).state).toBe('not_exposed');
  });

  it('reads the marker as a trace of 3.0.x, never as the list of exposed wallets', async () => {
    // 129807f0 TonBalanceService.ts:192 stored the addresses before the request was sent.
    const { exposure, store } = load({ ...MASTER_305.storage, myAddresses: [TON_NATIVE] });

    const status = await exposure.getStatus();

    expect(record(store).evidence).toEqual(['masterPassword', 'tonAccount', 'sentMarker']);
    expect(status.wallets.map(({ address }) => address)).toEqual([SUBSTRATE, TON_BIP39, TON_NATIVE]);
  });

  it('counts TON wallets that outlived a wallet reset in 3.0.5', async () => {
    const afterReset = Object.fromEntries(
      Object.entries(MASTER_305.storage).filter(([key]) => !key.startsWith('fw:account:') && key !== 'fw:keyring')
    );
    const { exposure, store } = load(afterReset);

    const status = await exposure.getStatus();

    expect(record(store).evidence).toEqual(['tonAccount']);
    expect(status.wallets.map(({ address }) => address)).toEqual([TON_BIP39, TON_NATIVE]);
  });

  it('leaves out accounts whose key was never stored here', async () => {
    const { exposure, store } = load(MASTER_305.storage);
    for (const flag of ['isExternal', 'isHardware', 'isInjected', 'isMobile']) {
      mocks.backend.addFromUri(`//${flag}`, { name: flag, [flag]: true });
    }

    await exposure.init();

    expect(record(store).accounts.map(({ name }) => name)).toEqual(['Main', 'Main', 'TON from BIP39', 'TON native']);
  });

  it('lists an EVM account without a parent as a wallet of its own', async () => {
    const standalone = Object.fromEntries(
      Object.entries(MASTER_305.storage).filter(([key]) => !key.startsWith('fw:account:0x66933bd1') && !key.startsWith('fw:ton:'))
    );
    const { exposure } = load(standalone);

    expect((await exposure.getStatus()).wallets).toEqual([
      { address: EVM, walletEcosystem: 'evm', name: 'Main', present: true },
    ]);
  });

  it('writes an empty baseline on a fresh install, so the first wallet is never listed', async () => {
    const { exposure, store, start } = load({});

    expect((await exposure.getStatus()).state).toBe('not_exposed');
    expect(record(store).accounts).toEqual([]);

    mocks.hash = bcrypt.hashSync('new', 4);
    mocks.backend.addFromUri(NEW_MNEMONIC, { name: 'First', isMasterPassword: true, walletEcosystem: 'substrate' });

    expect((await start().getStatus()).state).toBe('not_exposed');
  });
});

describe('the baseline after the first start', () => {
  it('does not grow: a wallet created after the update is a new wallet on every later start', async () => {
    const { exposure, start } = load(MASTER_305.storage);
    await exposure.init();
    const created = mocks.backend.addFromUri(NEW_MNEMONIC, { name: 'New wallet', isMasterPassword: true, walletEcosystem: 'substrate' });

    const status = await start().getStatus();

    expect(status.wallets.map(({ address }) => address)).toEqual([SUBSTRATE, TON_BIP39, TON_NATIVE]);
    expect(status.newWallets).toEqual([{ address: created.address, walletEcosystem: 'substrate', name: 'New wallet' }]);
  });

  it('keeps a removed wallet listed, because its phrase stays possibly exposed', async () => {
    const { exposure, tonAccounts } = load(MASTER_305.storage);
    await exposure.init();

    mocks.backend.removePair(SUBSTRATE);
    delete tonAccounts[TON_NATIVE];

    expect((await exposure.getStatus()).wallets).toEqual([
      { address: SUBSTRATE, walletEcosystem: 'substrate', name: 'Main', present: false },
      { address: TON_BIP39, walletEcosystem: 'ton', name: 'TON from BIP39', present: true },
      { address: TON_NATIVE, walletEcosystem: 'ton', name: 'TON native', present: false },
    ]);
  });

  it('still lists an exposed wallet that was removed and added again from the same phrase', async () => {
    const { exposure } = load(MASTER_305.storage);
    await exposure.init();
    const json = MASTER_305.storage['fw:account:0x66933bd1f37070ef87bd1198af3dacceb095237f803f3d32b173e6b425ed7972'];

    mocks.backend.removePair(SUBSTRATE);
    mocks.backend.addFromJson({ ...(json as KeyringPair$Json), meta: { name: 'Imported again', isMasterPassword: true } });

    const status = await exposure.getStatus();
    expect(status.wallets[0]).toEqual({ address: SUBSTRATE, walletEcosystem: 'substrate', name: 'Imported again', present: true });
    expect(status.newWallets).toEqual([]);
  });

  it('leaves a record written by a later format as it is and shows nothing', async () => {
    const later = { version: 2, anything: true };
    const { exposure, store, io } = load({ ...MASTER_305.storage, legacyExposure: later });

    expect((await exposure.getStatus()).state).toBe('unknown');
    expect(exposure.isEnrollmentAllowed(SUBSTRATE)).toBe(false);
    await exposure.acknowledge();

    expect(io.write).not.toHaveBeenCalled();
    expect(store.legacyExposure).toEqual(later);
  });
});

describe('acknowledging the notice', () => {
  it('holds new network addresses back from exposed accounts until the user has acknowledged', async () => {
    const { exposure, keyringService } = load(MASTER_305.storage);
    await exposure.init();

    // The password the real 3.0.5 build stored: the hash verifies and the stored keys open with it.
    expect(keyringService.unlockKeyring({ password: MASTER_305.provenance.masterPassword as string })).toBe(true);
    expect(() => mocks.backend.getPair(SUBSTRATE).decodePkcs8(mocks.master)).not.toThrow();
    await keyringService.waitForLegacyNetworkEnrollment();
    expect(enrolled()).toEqual([]);

    const status = await exposure.acknowledge();
    await keyringService.waitForLegacyNetworkEnrollment();

    expect(status).toMatchObject({ state: 'acknowledged', acknowledgedAt: NOW });
    expect(enrolled().sort()).toEqual([SUBSTRATE, EVM].sort());
  });

  it('never holds back a wallet created after the update', async () => {
    const { exposure, keyringService } = load(MASTER_305.storage);
    await exposure.init();
    const created = mocks.backend.addFromUri(NEW_MNEMONIC, { name: 'New wallet', isMasterPassword: true });

    keyringService.unlockKeyring({ password: MASTER_305.provenance.masterPassword as string });
    await keyringService.waitForLegacyNetworkEnrollment();

    expect(enrolled()).toEqual([created.address]);
  });

  it('stays acknowledged after a restart and enrolls on the next unlock', async () => {
    const { exposure, keyringService, start } = load(MASTER_305.storage);
    await exposure.acknowledge();

    const restarted = start();
    await restarted.init();
    expect((await restarted.getStatus()).state).toBe('acknowledged');

    keyringService.unlockKeyring({ password: MASTER_305.provenance.masterPassword as string });
    await keyringService.waitForLegacyNetworkEnrollment();
    expect(enrolled().sort()).toEqual([SUBSTRATE, EVM].sort());
  });

  it('lets the user past the notice when storage refuses the write, and writes it later', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { exposure, store, io } = load(MASTER_305.storage);
    await exposure.init();
    io.write.mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'));

    expect((await exposure.acknowledge()).state).toBe('acknowledged');
    expect(record(store).acknowledgedAt).toBeUndefined();
    expect(exposure.isEnrollmentAllowed(SUBSTRATE)).toBe(true);

    expect((await exposure.getStatus()).state).toBe('acknowledged');
    expect(record(store).acknowledgedAt).toBe(NOW);
  });

  it('records the backup confirmation and the moved marks, and only for listed wallets', async () => {
    const { exposure, store } = load(MASTER_305.storage);
    await exposure.acknowledge();

    await exposure.update({ backupConfirmed: true });
    await exposure.update({ moved: { address: TON_NATIVE, moved: true } });
    // A linked EVM account is moved with its wallet, and an unknown address is not a wallet.
    await exposure.update({ moved: { address: EVM, moved: true } });
    const status = await exposure.update({ moved: { address: '5UnknownAddress', moved: true } });

    expect(status.backupConfirmedAt).toBe(NOW);
    expect(status.wallets.filter(({ movedAt }) => movedAt).map(({ address }) => address)).toEqual([TON_NATIVE]);
    expect(record(store).movedAt).toEqual({ [TON_NATIVE]: NOW });

    const undone = await exposure.update({ backupConfirmed: false, moved: { address: TON_NATIVE, moved: false } });
    expect(undone.backupConfirmedAt).toBeUndefined();
    expect(undone.wallets.some(({ movedAt }) => movedAt)).toBe(false);
    expect(record(store)).not.toHaveProperty('backupConfirmedAt');
  });
});

describe('when the stored state cannot be read', () => {
  it('shows nothing, enrolls nothing, never throws, and reads again on the next request', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { exposure, keyringService, io } = load(MASTER_305.storage);
    io.read.mockRejectedValueOnce(new Error('IO error: LOCK file in use'));

    await expect(exposure.init()).resolves.toBeUndefined();
    expect(exposure.status).toEqual({ state: 'unknown', wallets: [], newWallets: [] });
    expect(io.write).not.toHaveBeenCalled();

    keyringService.unlockKeyring({ password: MASTER_305.provenance.masterPassword as string });
    await keyringService.waitForLegacyNetworkEnrollment();
    expect(enrolled()).toEqual([]);

    expect((await exposure.getStatus()).state).toBe('notice_pending');
    expect(io.write).toHaveBeenCalledOnce();
  });

  it('keeps the baseline it took when the first write fails and writes that one later', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { exposure, store, io } = load(MASTER_305.storage);
    io.write.mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'));

    await exposure.init();
    expect(store.legacyExposure).toBeUndefined();
    mocks.backend.addFromUri(NEW_MNEMONIC, { name: 'New wallet', isMasterPassword: true });

    const status = await exposure.getStatus();
    expect(status.newWallets.map(({ name }) => name)).toEqual(['New wallet']);
    expect(record(store).accounts.map(({ name }) => name)).toEqual(['Main', 'Main', 'TON from BIP39', 'TON native']);
  });
});

describe('popup messages', () => {
  it('answers status, acknowledgement and updates with plain data', async () => {
    const { exposure } = load(MASTER_305.storage);
    const extension = { state: { keyringService: { isResetting: false }, legacyExposureService: exposure } } as unknown as Extension;
    const handle = (message: string, request: unknown = null) =>
      Extension.prototype.handle.call(extension, 'id', message as never, request as never);

    const pending = await handle('pri(security.legacyExposure.status)');
    expect(structuredClone(pending)).toStrictEqual(pending);
    expect(pending).toMatchObject({ state: 'notice_pending' });

    expect(await handle('pri(security.legacyExposure.acknowledge)')).toMatchObject({ state: 'acknowledged' });
    expect(await handle('pri(security.legacyExposure.update)', { backupConfirmed: true })).toMatchObject({
      state: 'acknowledged',
      backupConfirmedAt: NOW,
    });
  });
});
