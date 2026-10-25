import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Keyring } from '@polkadot/keyring';
import { hexToU8a, u8aToHex } from '@polkadot/util';
import { cryptoWaitReady, decodeAddress } from '@polkadot/util-crypto';
import { Wallet } from 'ethers';
import { beforeAll, describe, expect, it } from 'vitest';
import { decryptTonSeed } from '@extension-base/services/keyring-service/TonSeedVault';
import { needsLegacyPasswordMigration } from '@extension-base/services/keyring-service/AccountAccess';
// Public test secrets the profiles were written with (scripts/upgrade-e2e/secrets.mjs).
import { EVM_PATH, PASSWORDS } from '../../scripts/upgrade-e2e/secrets.mjs';
import type { KeyringPair } from '@subwallet/keyring/types';
import { deriveCompatibleTonKeyPair } from '@/util/tonKeyring';

// Profiles that released builds wrote themselves (web-keys.md §6.5): `scripts/upgrade-e2e/run.mjs --snapshot` lets each
// build, built from its own commit and lockfile, create the wallets of a scenario in Chrome for Testing and stores
// chrome.storage.local as tests/fixtures/upgrade/<version>/<state>.json. Nothing in `storage` was written by this
// tree's code, so these tests check 4.2.0's logic against what users' devices actually hold (addendum U0.6).

type ProfileWallet = {
  name: string;
  address: string;
  type?: 'sr25519' | 'ed25519' | 'ecdsa';
  ethereumAddress?: string;
  kind: string;
  phrase?: string;
  path?: string;
  seed?: string;
  evmPrivateKey?: string;
  ethereumPhrase?: string;
};
type Snapshot = {
  provenance: { commit: string; yarnLockSha256: string; syntheticSecretsOnly: boolean; scenario: string };
  profile: {
    master: string;
    wallets: ProfileWallet[];
    standalone: ProfileWallet[];
    ton: { name: string; address: string; phrase: string }[];
  };
  storage: Record<
    string,
    {
      address?: string;
      encoded?: string;
      encoding?: { content: string[] };
      meta?: Record<string, unknown>;
      cipherSeed?: string;
      publicKeyHex?: string;
    }
  >;
};

const fixtures = path.resolve(__dirname, '../fixtures/upgrade');
const builds: { id: string; sha: string }[] = JSON.parse(
  readFileSync(path.resolve(__dirname, '../upgrade/legacy-builds.json'), 'utf8')
).builds;
const snapshots = readdirSync(fixtures, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && builds.some(({ id }) => id === entry.name))
  .flatMap((dir) =>
    readdirSync(path.join(fixtures, dir.name))
      .filter((file) => file.endsWith('.json'))
      .map((file) => ({
        version: dir.name,
        state: file.replace(/\.json$/, ''),
        data: JSON.parse(readFileSync(path.join(fixtures, dir.name, file), 'utf8')) as Snapshot,
      }))
  );
type KeyringPair$Json = Parameters<Keyring['addFromJson']>[0];

const passwords = [...new Set(Object.values(PASSWORDS) as string[])];
const records = (snapshot: Snapshot) =>
  Object.entries(snapshot.storage).filter(
    ([key, value]) => key.startsWith('fw:account:') && value?.encoded
  ) as unknown as [string, KeyringPair$Json][];

// After the 32-byte salt: N, p and r as little-endian u32 (@polkadot/util-crypto scrypt/toU8a).
const scryptN = (json: KeyringPair$Json) => Buffer.from(json.encoded, 'base64').readUInt32LE(32);

/** Each stored key opened with the scenario's test passwords (the profile's own first: scrypt makes each try slow),
 * by storage key. Undefined where none opens it. */
const openedCache = new Map<
  Snapshot,
  Map<string, { password: string; pair: ReturnType<Keyring['addFromJson']> } | undefined>
>();
function openedRecords(snapshot: Snapshot) {
  if (!openedCache.has(snapshot)) {
    const own = [
      snapshot.profile.master,
      ...[...snapshot.profile.wallets, ...snapshot.profile.standalone].flatMap((wallet) => [
        (wallet as { password?: string }).password,
        (wallet as { ethereumPassword?: string }).ethereumPassword,
      ]),
    ];
    const candidates = [...new Set([...own, ...passwords].filter((password): password is string => !!password))];
    const open = (json: KeyringPair$Json) => {
      for (const password of candidates) {
        const pair = new Keyring({ type: json.encoding.content[1] as 'sr25519' }).addFromJson(json);
        try {
          pair.decodePkcs8(password);
          return { password, pair };
        } catch {
          // not this one
        }
      }
      return undefined;
    };
    openedCache.set(snapshot, new Map(records(snapshot).map(([key, json]) => [key, open(json)])));
  }
  return openedCache.get(snapshot)!;
}

const expectedSubstrate = (wallet: ProfileWallet) =>
  new Keyring({ type: wallet.type ?? 'sr25519' }).addFromUri(
    wallet.kind === 'raw' ? wallet.seed! : `${wallet.phrase}${wallet.path ?? ''}`,
    {},
    wallet.type ?? 'sr25519'
  );
const expectedEthereum = (wallet: ProfileWallet) =>
  wallet.evmPrivateKey
    ? new Wallet(wallet.evmPrivateKey).address
    : new Keyring({ type: 'ethereum' }).addFromUri(`${wallet.ethereumPhrase ?? wallet.phrase}${EVM_PATH}`).address;

beforeAll(async () => {
  await cryptoWaitReady();
});

describe('profiles written by released builds', () => {
  it('cover every scenario that starts from a released build', () => {
    expect(snapshots.map(({ version, state }) => `${version}/${state}`).sort()).toEqual(
      expect.arrayContaining([
        '1.3.1/S7-per-account-passwords',
        '2.0.1/S7b-per-account-passwords',
        '2.6.3/S1-per-account-passwords',
        '2.7.1/S5-master-password',
        '3.0.5/S2-from-2.6.3-partial-migration',
        '3.0.5/S3-master-password',
        '3.0.5/S4-password-changed-mixed-ton',
        '3.0.5/S6-reset-orphan-ton',
        '3.0.5/S8-standalone-ethereum-no-current',
      ])
    );
  });

  describe.each(snapshots)('$version $state', ({ version, data }) => {
    it('names the commit it was built from and holds public test secrets only', () => {
      expect(data.provenance.commit).toBe(builds.find(({ id }) => id === version)!.sha);
      expect(data.provenance.syntheticSecretsOnly).toBe(true);
      expect(data.provenance.yarnLockSha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('stores every key at N = 2^15, the only cost the 2.x and 3.0.x libraries open', () => {
      expect(records(data).length).toBeGreaterThan(0);
      for (const [, json] of records(data)) expect(scryptN(json)).toBe(32768);
    });

    it('holds every wallet under the address its public secret derives, and each key opens with a recorded password', () => {
      // The account store keys a Substrate record by its public key and an Ethereum record by its address.
      const opened = openedRecords(data);
      for (const wallet of data.profile.wallets) {
        const substrate = expectedSubstrate(wallet);
        expect(substrate.address, wallet.name).toBe(wallet.address);
        const record = opened.get(`fw:account:${u8aToHex(decodeAddress(wallet.address))}`);
        expect(record, `${wallet.name} opens`).toBeDefined();
        expect(u8aToHex(record!.pair.publicKey)).toBe(u8aToHex(substrate.publicKey));
      }
      for (const wallet of [...data.profile.wallets, ...data.profile.standalone].filter(
        ({ ethereumAddress }) => ethereumAddress
      )) {
        expect(wallet.ethereumAddress!.toLowerCase(), wallet.name).toBe(expectedEthereum(wallet).toLowerCase());
        const record = opened.get(`fw:account:${wallet.ethereumAddress!.toLowerCase()}`);
        expect(record, `${wallet.name} Ethereum opens`).toBeDefined();
        expect(record!.pair.address.toLowerCase()).toBe(wallet.ethereumAddress!.toLowerCase());
      }
    }, 300_000);

    it('asks for an old password (needsLegacyPasswordMigration) exactly for the keys the master password does not open', () => {
      const hasMaster = !!data.storage['fw:keyring'];
      for (const [key, opened] of openedRecords(data)) {
        expect(opened, key).toBeDefined();
        const underMaster = hasMaster && opened!.password === data.profile.master;
        expect(needsLegacyPasswordMigration(opened!.pair as unknown as KeyringPair), key).toBe(!underMaster);
      }
    }, 300_000);

    it('keeps every TON phrase under a recorded master password, and 4.2.0 derives the stored key from it', async () => {
      for (const wallet of data.profile.ton) {
        const stored = data.storage[`fw:ton:${wallet.address}`];
        expect(stored, wallet.name).toBeDefined();
        const publicKey = hexToU8a(stored!.publicKeyHex!);
        let phrase: string | undefined;
        for (const password of passwords) phrase ??= await decryptTonSeed(stored!.cipherSeed, password, publicKey);
        expect(phrase, wallet.name).toBe(wallet.phrase);
        const pair = await deriveCompatibleTonKeyPair(phrase!.split(' '), publicKey);
        expect(u8aToHex(pair.publicKey)).toBe(u8aToHex(publicKey));
      }
    }, 120_000);
  });

  // The scenarios create wallets with the messages each build's own screens send (scripts/upgrade-e2e/drivers.mjs).
  // Profiles made by clicking through the 2.6.3 and 3.0.5 screens (WK-9 lane, *.storage.json) show those messages
  // store records of the same shape.
  it.each([
    ['2.6.3', 'S1-per-account-passwords', 'chrome-2.6.3-account-passwords.storage.json'],
    ['3.0.5', 'S3-master-password', 'chrome-3.0.5-master-password.storage.json'],
  ])('%s %s stores wallet records shaped like the ones its own screens stored', (version, state, uiFixture) => {
    const ui = JSON.parse(readFileSync(path.join(fixtures, uiFixture), 'utf8')).storage as Snapshot['storage'];
    const snapshot = snapshots.find((entry) => entry.version === version && entry.state === state)!.data;
    const shape = (record: Snapshot['storage'][string]) => ({
      fields: Object.keys(record).sort(),
      meta: Object.keys(record.meta ?? {}).sort(),
      type: record.encoding?.content?.[1],
    });
    const uiShapes = Object.entries(ui)
      .filter(([key]) => key.startsWith('fw:account:') || key.startsWith('fw:ton:'))
      .map(([, record]) => shape(record));
    const created = snapshot.profile.wallets.find(({ kind }) => kind === 'mnemonic')!;
    // The account store keys a Substrate record by its public key and an Ethereum record by its address.
    const ownRecords = [u8aToHex(decodeAddress(created.address)), created.ethereumAddress!.toLowerCase()].map(
      (key) => snapshot.storage[`fw:account:${key}`]!
    );
    expect(ownRecords.every(Boolean)).toBe(true);
    for (const record of ownRecords) expect(uiShapes).toContainEqual(shape(record));
    for (const ton of snapshot.profile.ton)
      expect(uiShapes).toContainEqual(shape(snapshot.storage[`fw:ton:${ton.address}`]!));
  });
});
