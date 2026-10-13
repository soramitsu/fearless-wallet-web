import { Address, loadMessage, type Cell } from '@ton/core';
import { mnemonicToPrivateKey, sign, signVerify } from '@ton/crypto';
import { validateMnemonic } from 'bip39';
import CryptoJS from 'crypto-js';
import * as tonWebMnemonic from 'tonweb-mnemonic';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  records: new Map<string, TonStoreAccount>(),
  keyring: { hash: '', master: '' },
  failWrites: false,
  beforeWrite: undefined as undefined | (() => Promise<void>),
}));

// An in-memory chrome.storage double for `fw:ton:*` that, like BaseExtensionStore.updateAndWait,
// hands the transform a copy of the stored record and publishes only after the write.
vi.mock('@extension-base/stores/TonStore', () => {
  const copy = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

  return {
    tonStore: {
      all: async (update: (address: string, record: TonStoreAccount) => void) => {
        await Promise.resolve();
        for (const [address, record] of mocks.records) update(address, copy(record));
      },
      set: vi.fn((address: string, record: TonStoreAccount) => mocks.records.set(address, copy(record))),
      getAndWait: vi.fn(async (address: string) => copy(mocks.records.get(address))),
      remove: vi.fn((address: string) => mocks.records.delete(address)),
      updateAndWait: vi.fn(async (address: string, transform, publish?: (record: TonStoreAccount) => void) => {
        const next = transform(copy(mocks.records.get(address)));
        if (next === undefined) return undefined;
        await mocks.beforeWrite?.();
        if (mocks.failWrites) throw new Error('disk unavailable');
        mocks.records.set(address, copy(next));
        publish?.(copy(next));
        return next;
      }),
    },
  };
});
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {
  keyring: {
    get hasMasterPassword() { return !!mocks.keyring.hash; },
    get isLocked() { return !mocks.keyring.master; },
  },
  getAccounts: () => [],
  getAddresses: () => [],
  getPair: () => { throw new Error('Missing pair'); },
  unlockKeyring: (password: string) => {
    if (!mocks.keyring.hash || password !== mocks.keyring.hash) throw new Error('Invalid master password');
    mocks.keyring.master = password;
  },
  lockAll: () => { mocks.keyring.master = ''; },
} }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@extension-base/stores/CurrentAccountStore', () => ({ default: class {} }));
vi.mock('@extension-base/stores/Accounts', () => ({ default: class {} }));
vi.mock('@extension-base/stores/KeyringStore', () => ({ default: class {} }));
vi.mock('@extension-base/stores/KeyringStoreWeb', () => ({ default: class {} }));
vi.mock('@extension-base/stores/LegacyPasswordPromptStore', () => ({ default: class {
  getAndWait = async () => undefined;
  setAndWait = async () => undefined;
  remove = () => undefined;
} }));
vi.mock('@extension-base/services/keyring-service/LegacyNetworkEnrollment', () => ({ enrollLegacyAccountNetworks: vi.fn() }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
// Extension is exercised through its prototype; its services are never built.
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));

import { makeTonTransfer } from '@extension-base/api/ton/transfer';
import Extension from '@extension-base/background/handlers/Extension';
import { KeyringService } from '@extension-base/services/keyring-service';
import { TonBalance } from '@extension-base/services/ton-balance/TonBalance';
import { TonProviderRouter } from '@extension-base/services/ton-provider';
import { tonStore } from '@extension-base/stores/TonStore';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import registrySnapshot from '../fixtures/legacy-305/chains-v13.snapshot.json';
import tiResponses from '../fixtures/ton/ti-responses-20261011.json';
import androidVectors from '../fixtures/ton/ton-android-4.2.0-vectors.json';
import bip39Vectors from '../fixtures/ton/ton-bip39-3.0.5-vectors.json';
import nativeVectors from '../fixtures/ton/ton-native-3.0.5-vectors.json';
import type { TonStoreAccount } from '@extension-base/stores/TonStore';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type State from '@extension-base/background/handlers/State';
import type { TonImportCandidateInfo } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import {
  createTonWalletContractV4R2,
  deriveTonAccount,
  deriveTonImportCandidates,
  deriveTonImportChoice,
  isTonPhraseIrregular,
  normalizeTonImportPhrase,
  tonImportTextAsTyped,
  type TonImportChoice,
} from '@/util/tonKeyring';

// tonweb derives native and 3.0.x keys with 100 000 PBKDF2 rounds per phrase.
const PBKDF2_SUITE = { timeout: 120_000 };
const MASTER_PASSWORD = 'current master password';
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');
const payload = Buffer.from('TON import chooser fixture');

// Written by the 3.0.5 libraries (scripts/generate-ton-legacy-vectors.mjs). Public test phrases: never fund them.
const [REAL_BUILD] = bip39Vectors.vectors;
const nativeOnly = nativeVectors.vectors.filter(({ bip39Valid }) => !bip39Valid);
const nativeAndBip39 = nativeVectors.vectors.filter(({ bip39Valid }) => bip39Valid);

describe('TON import candidates', PBKDF2_SUITE, () => {
  it('offers the universal address and the one 3.0.x stored for every BIP39 phrase 3.0.5 accepted', async () => {
    expect(bip39Vectors.vectors.length).toBeGreaterThanOrEqual(48);

    for (const vector of bip39Vectors.vectors) {
      const [universal, legacy, ...rest] = await deriveTonImportCandidates(vector.mnemonic);

      expect(rest).toEqual([]);
      expect(universal).toMatchObject({ derivation: 'universal', address: deriveTonAccount({ mnemonic: vector.mnemonic }).address });
      expect(legacy).toMatchObject({ derivation: 'fearless-legacy', address: vector.address, phrase: vector.mnemonic });
      expect(hex(legacy.publicKey)).toBe(vector.publicKeyHex);
      expect(universal.address).not.toBe(legacy.address);
      expect(signVerify(payload, sign(payload, Buffer.from(legacy.secretKey)), Buffer.from(vector.publicKeyHex, 'hex'))).toBe(true);
    }
  });

  it('includes the address the real 3.0.5 build stored', async () => {
    const candidates = await deriveTonImportCandidates(REAL_BUILD.mnemonic);

    expect(REAL_BUILD.address).toBe(bip39Vectors.source.realBuildAddress);
    expect(candidates.map(({ derivation, address }) => ({ derivation, address }))).toEqual([
      { derivation: 'universal', address: deriveTonAccount({ mnemonic: REAL_BUILD.mnemonic }).address },
      { derivation: 'fearless-legacy', address: 'UQC-UdqQ66NWBZO-TGQ3YBfis8kz37HNFju2aKWBNESTSb44' },
    ]);
  });

  it('puts the golden Universal Wallet address first', async () => {
    for (const vector of vectors.vectors) {
      const words = vector.mnemonic.split(' ');
      const [universal, legacy] = await deriveTonImportCandidates(vector.mnemonic);

      expect(universal).toMatchObject({ derivation: 'universal', address: vector.expected.ton.addressNonBounceable });
      expect(hex(universal.publicKey)).toBe(vector.expected.ton.publicKeyHex);
      // @ton/crypto is an independent implementation of the KDF 3.0.x applied.
      expect(legacy.derivation).toBe('fearless-legacy');
      expect(hex(legacy.publicKey)).toBe(hex((await mnemonicToPrivateKey(words)).publicKey));
    }
  });

  it('opens a native TON phrase only at the address 3.0.x stored for it', async () => {
    expect(nativeOnly.length).toBeGreaterThanOrEqual(24);
    expect(new Set(nativeOnly.map(({ mnemonic }) => mnemonic.split(' ').length))).toEqual(new Set([12, 18, 24]));

    for (const vector of nativeOnly) {
      // The check the release candidate ran on every import refused these phrases.
      expect(validateMnemonic(vector.mnemonic)).toBe(false);
      expect(vector.tonwebValid).toBe(true);

      const candidates = await deriveTonImportCandidates(vector.mnemonic);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ derivation: 'native', address: vector.address, phrase: vector.mnemonic });
      expect(hex(candidates[0].publicKey)).toBe(vector.publicKeyHex);
      expect(signVerify(payload, sign(payload, Buffer.from(candidates[0].secretKey)), Buffer.from(vector.publicKeyHex, 'hex'))).toBe(true);
    }
  });

  it('offers both addresses for a native phrase that also passes BIP39', async () => {
    expect(nativeAndBip39.length).toBeGreaterThanOrEqual(4);

    for (const vector of nativeAndBip39) {
      expect(validateMnemonic(vector.mnemonic)).toBe(true);

      const [universal, native, ...rest] = await deriveTonImportCandidates(vector.mnemonic);

      expect(rest).toEqual([]);
      expect(universal).toMatchObject({ derivation: 'universal', address: deriveTonAccount({ mnemonic: vector.mnemonic }).address });
      expect(native).toMatchObject({ derivation: 'native', address: vector.address });
      expect(hex(native.publicKey)).toBe(vector.publicKeyHex);
      expect(universal.address).not.toBe(native.address);
    }
  });

  it('has no candidate for text that is not a phrase', async () => {
    for (const notAPhrase of ['', ' \n ', 'invalid', [...REAL_BUILD.mnemonic.split(' ')].reverse().join(' '), `${REAL_BUILD.mnemonic} legal`]) {
      expect(await deriveTonImportCandidates(notAPhrase)).toEqual([]);
    }
  });

  it('also offers the address of the text exactly as typed when it differs from the tidied phrase', async () => {
    const [universal, legacy] = await deriveTonImportCandidates(REAL_BUILD.mnemonic);
    const typed = `  ${REAL_BUILD.mnemonic.replace('legal winner', 'Legal  winner')} `;
    const candidates = await deriveTonImportCandidates(typed);

    // 3.0.5 refused irregular spacing and capitals, so its addresses come from the tidied phrase.
    expect(candidates.map(({ derivation, address, phrase }) => ({ derivation, address, phrase }))).toEqual([
      { derivation: 'universal', address: universal.address, phrase: REAL_BUILD.mnemonic },
      { derivation: 'fearless-legacy', address: legacy.address, phrase: REAL_BUILD.mnemonic },
      { derivation: 'as-typed', address: expect.any(String), phrase: typed },
    ]);
    // tonweb's KDF hashes the words joined by single spaces, so the typed text is the key material.
    expect(hex(candidates[2].publicKey)).toBe(hex((await tonWebMnemonic.mnemonicToKeyPair(typed.split(' '))).publicKey));
    expect(new Set(candidates.map(({ address }) => address)).size).toBe(3);

    // Line breaks a paste adds at either end are not part of what anyone typed.
    expect(await deriveTonImportCandidates(`\r\n${REAL_BUILD.mnemonic}\n`)).toHaveLength(2);
    expect((await deriveTonImportCandidates(`${nativeOnly[0].mnemonic} `)).map(({ derivation }) => derivation)).toEqual([
      'native',
      'as-typed',
    ]);
  });

  it('tidies a pasted phrase without changing any phrase 3.0.5 stored', () => {
    expect(normalizeTonImportPhrase('  Legal  WINNER\tthank\nyear \r\n wave ')).toBe('legal winner thank year wave');
    expect(tonImportTextAsTyped('\r\n Legal  winner \n\n')).toBe(' Legal  winner ');

    for (const { mnemonic } of [...bip39Vectors.vectors, ...nativeVectors.vectors]) {
      expect(normalizeTonImportPhrase(mnemonic)).toBe(mnemonic);
      expect(isTonPhraseIrregular(mnemonic)).toBe(false);
    }

    expect(isTonPhraseIrregular(`${REAL_BUILD.mnemonic} `)).toBe(true);
    expect(isTonPhraseIrregular(REAL_BUILD.mnemonic.toUpperCase())).toBe(true);
  });

  it('derives only the address that was chosen', async () => {
    const [universal, legacy] = await deriveTonImportCandidates(REAL_BUILD.mnemonic);
    const chosen = await deriveTonImportChoice(REAL_BUILD.mnemonic, { derivation: 'fearless-legacy', address: legacy.address });

    expect(hex(chosen.publicKey)).toBe(REAL_BUILD.publicKeyHex);
    expect((await deriveTonImportChoice(REAL_BUILD.mnemonic, { derivation: 'universal', address: universal.address })).address).toBe(
      universal.address
    );
    // The address of one derivation is never saved under the other.
    await expect(
      deriveTonImportChoice(REAL_BUILD.mnemonic, { derivation: 'fearless-legacy', address: universal.address })
    ).rejects.toMatchObject({ code: 'account_key_mismatch' });
    await expect(deriveTonImportChoice(REAL_BUILD.mnemonic, { derivation: 'universal', address: legacy.address })).rejects.toMatchObject({
      code: 'account_key_mismatch',
    });
    await expect(deriveTonImportChoice(REAL_BUILD.mnemonic, { derivation: 'native', address: legacy.address })).rejects.toMatchObject({
      code: 'unsupported_ton_derivation',
    });
    // Tidy text has no as-typed address of its own.
    await expect(deriveTonImportChoice(REAL_BUILD.mnemonic, { derivation: 'as-typed', address: legacy.address })).rejects.toMatchObject({
      code: 'unsupported_ton_derivation',
    });
    await expect(
      deriveTonImportChoice(nativeOnly[0].mnemonic, { derivation: 'universal', address: nativeOnly[0].address })
    ).rejects.toMatchObject({ code: 'unsupported_ton_derivation' });
    await expect(deriveTonImportChoice('invalid', { derivation: 'native', address: legacy.address })).rejects.toMatchObject({
      code: 'invalid_mnemonic',
    });
  });
});

// Every TON wallet the shipped Android 4.2.0 app stored: typed text kept verbatim, key from its raw split.
describe('TON import candidates for phrases from the Android app', PBKDF2_SUITE, () => {
  const expectedDerivation = ({ kind, variant }: (typeof androidVectors.vectors)[number]) =>
    variant !== 'canonical' ? 'as-typed' : kind === 'bip39' ? 'fearless-legacy' : 'native';

  it('offers the address the Android app stored for every phrase, typed exactly as it was kept', async () => {
    expect(androidVectors.source.prodApp420).toMatch(/^b5e22d49d/);
    expect(new Set(androidVectors.vectors.map(({ variant }) => variant))).toEqual(
      new Set(['canonical', 'trailing-space', 'double-space', 'upper'])
    );

    for (const vector of androidVectors.vectors) {
      const candidates = await deriveTonImportCandidates(vector.typedText);
      const stored = candidates.find(({ publicKey }) => hex(publicKey) === vector.publicKeyHex);

      expect(stored, `${vector.kind} ${vector.variant}`).toMatchObject({ derivation: expectedDerivation(vector) });
      // The phrase that is saved is the one that opens the key: exactly as typed, or tidied when that is the same.
      expect(stored!.phrase).toBe(vector.sameKeyAsNormalized ? normalizeTonImportPhrase(vector.typedText) : vector.typedText);
      // The v4R2 address helper is checked against the addresses 3.0.5 stored above.
      expect(stored!.address).toBe(
        createTonWalletContractV4R2(Buffer.from(vector.publicKeyHex, 'hex')).address.toString({ bounceable: false, urlSafe: true })
      );
      expect(signVerify(payload, sign(payload, Buffer.from(stored!.secretKey)), Buffer.from(vector.publicKeyHex, 'hex'))).toBe(true);
      // The tidied phrase alone would open a different address.
      if (!vector.sameKeyAsNormalized) {
        const tidied = await deriveTonImportCandidates(normalizeTonImportPhrase(vector.typedText));
        expect(tidied.map(({ publicKey }) => hex(publicKey))).not.toContain(vector.publicKeyHex);
      }
    }
  });
});

const NETWORK_NAME = 'TON Mainnet';
// TON Mainnet as the shipped chains/v13 registry lists it (one TonAPI node, tonapi.io).
const tonNetwork = (registrySnapshot as unknown as NetworkJson[]).find(({ name }) => name === NETWORK_NAME)!;
// TI as it answers today (no service-info), so lookups and transfers go through the verified registry node.
const deployedTi = async () => new Response(JSON.stringify(tiResponses.deployed.serviceInfo.body), { status: 404 });
const friendly = (address: Address | string) =>
  (typeof address === 'string' ? Address.parse(address) : address).toString({ bounceable: false, urlSafe: true });
// Wallets a test has sent from; the registry node reports them as deployed.
const deployedWallets = new Set<string>();

// A background with an unlocked, empty wallet, as after a fresh install of this release.
async function background(lookup: (address: string) => unknown = () => { throw new Error('offline'); }) {
  mocks.keyring.hash = MASTER_PASSWORD;
  mocks.keyring.master = '';
  const keyringService = new KeyringService({ waitCryptoReady: new Promise(() => {}) } as never);
  await keyringService.tonKeyring.loadAll();
  expect(keyringService.unlockKeyring({ password: MASTER_PASSWORD })).toBe(true);

  const getAccount = vi.fn(async (address: Address) => lookup(friendly(address)));
  const getAccountSeqno = vi.fn().mockResolvedValue({ seqno: 3 });
  const sendBlockchainMessage = vi.fn();
  const setBalanceItem = vi.fn();
  const tonApi: State['getTonApiMap'] = {};
  const client = {
    accounts: {
      getAccount: async (address: Address) =>
        deployedWallets.has(friendly(address)) ? { balance: 1_000_000_000n, status: 'active' } : getAccount(address),
    },
    wallet: { getAccountSeqno },
    blockchain: { getBlockchainMasterchainHead: async () => ({ globalId: -239 }), sendBlockchainMessage },
  };
  const initApi = vi.fn(async (network: NetworkJson) => {
    tonApi[network.name.toLowerCase()] = {
      api: new TonProviderRouter(network, {
        fetchFn: deployedTi,
        createTonApiClient: () => client as never,
        logger: { info: () => undefined, warn: () => undefined },
      }),
    } as never;

    return true;
  });
  const destroyApi = vi.fn((name: string) => { delete tonApi[name.toLowerCase()]; });
  const state = {
    keyringService,
    getTonApiMap: tonApi,
    networkService: { networksGithub: [tonNetwork], tonApiHandler: { initApi, destroyApi } },
    balanceService: { setBalanceItem },
    updateCurrentAccount: vi.fn(),
  } as unknown as State;
  (state.balanceService as { tonBalanceService: TonBalance }).tonBalanceService = new TonBalance(state);
  const extension = Object.assign(Object.create(Extension.prototype) as Extension, { state });
  const candidates = (mnemonic: string) =>
    Extension.prototype.handle.call(extension, 'id', 'pri(keyring.tonImportCandidates)', { mnemonic }) as Promise<TonImportCandidateInfo[]>;
  const create = (suri: string, tonImport?: TonImportChoice, name = 'Restored TON') =>
    Extension.prototype.handle.call(extension, 'id', 'pri(accounts.create)', {
      suri,
      meta: { name },
      walletEcosystem: WalletEcosystem.Ton,
      tonImport,
    }) as Promise<string>;

  return { candidates, create, destroyApi, getAccount, initApi, keyringService, sendBlockchainMessage, setBalanceItem, state, tonApi };
}

const stored = (address: string) => mocks.records.get(address)!;
const decrypt = (record: TonStoreAccount) => CryptoJS.AES.decrypt(record.cipherSeed, MASTER_PASSWORD).toString(CryptoJS.enc.Utf8);
const tonPublicAccount = (record: TonStoreAccount) =>
  record.meta!.universalWallet!.publicAccounts.find(({ ecosystem }) => ecosystem === WalletEcosystem.Ton)!;

async function signedBy(state: State, sendBlockchainMessage: ReturnType<typeof vi.fn>, from: string, publicKeyHex: string) {
  deployedWallets.add(friendly(from));
  await makeTonTransfer(
    {
      balance: { walletAddress: undefined } as unknown as BalanceItem,
      networkKey: NETWORK_NAME,
      from,
      to: bip39Vectors.vectors[1].address,
      amount: '0.5',
      assetId: 'ton',
    },
    state
  );
  const [{ boc }] = sendBlockchainMessage.mock.calls.at(-1) as [{ boc: Cell }];
  const message = loadMessage(boc.beginParse());
  const body = message.body.beginParse();
  const signature = body.loadBuffer(64);

  expect((message.info.dest as Address).equals(Address.parse(from))).toBe(true);

  return signVerify(body.asCell().hash(), signature, Buffer.from(publicKeyHex, 'hex'));
}

beforeEach(() => {
  deployedWallets.clear();
  mocks.records.clear();
  mocks.failWrites = false;
  mocks.beforeWrite = undefined;
  vi.mocked(tonStore.set).mockClear();
  vi.mocked(tonStore.updateAndWait).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('restoring a 3.0.x TON wallet from its phrase', PBKDF2_SUITE, () => {
  it('does not select a TON wallet or answer the creation message before its seed commits', async () => {
    const { create, state } = await background();
    const [golden] = vectors.vectors;
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    mocks.beforeWrite = async () => { entered(); await gate; };
    let answered = false;
    const imported = create(golden.mnemonic).then((address) => { answered = true; return address; });
    try {
      await Promise.race([started, imported]);
      expect(answered).toBe(false);
      expect(state.updateCurrentAccount).not.toHaveBeenCalled();
    } finally {
      release();
      await imported;
    }
    expect(state.updateCurrentAccount).toHaveBeenCalledWith({
      address: golden.expected.ton.addressNonBounceable,
      walletEcosystem: WalletEcosystem.Ton,
    });
  });

  it('propagates failed seed persistence through the creation message and leaves selection alone', async () => {
    const { create, keyringService, state } = await background();
    mocks.failWrites = true;
    await expect(create(vectors.vectors[0].mnemonic)).rejects.toThrow('disk unavailable');
    expect(state.updateCurrentAccount).not.toHaveBeenCalled();
    expect(keyringService.tonKeyring.getAccounts()).toEqual([]);
    expect(mocks.records.size).toBe(0);
  });

  it('reopens a TON wallet that 3.0.x imported from a BIP39 phrase at its stored address', async () => {
    for (const vector of bip39Vectors.vectors.slice(0, 4)) {
      const { candidates, create, keyringService, sendBlockchainMessage, state } = await background();
      const offered = await candidates(vector.mnemonic);
      const legacy = offered.find(({ derivation }) => derivation === 'fearless-legacy')!;

      expect(offered.map(({ derivation }) => derivation)).toEqual(['universal', 'fearless-legacy']);
      expect(legacy.address).toBe(vector.address);

      await expect(create(vector.mnemonic, { derivation: legacy.derivation, address: legacy.address })).resolves.toBe(vector.address);

      const record = stored(vector.address);
      expect(record).toMatchObject({ address: vector.address, publicKeyHex: vector.publicKeyHex, name: 'Restored TON' });
      expect(decrypt(record)).toBe(vector.mnemonic);
      expect(record.meta).toMatchObject({
        tonDerivation: 'fearless-legacy',
        tonAddress: vector.address,
        tonPublicKeyHex: vector.publicKeyHex,
        walletEcosystem: WalletEcosystem.Ton,
      });
      // The Universal Wallet path does not lead to this key, so it is not recorded for it.
      expect(tonPublicAccount(record)).toMatchObject({ address: vector.address, publicKeyHex: vector.publicKeyHex });
      expect(tonPublicAccount(record)).not.toHaveProperty('derivationPath');
      expect(state.updateCurrentAccount).toHaveBeenCalledWith({ address: vector.address, walletEcosystem: WalletEcosystem.Ton });

      // The restored wallet exports its phrase and signs with the key 3.0.x used.
      await expect(
        keyringService.exportAccountMnemonic({ address: vector.address, password: MASTER_PASSWORD, walletEcosystem: WalletEcosystem.Ton })
      ).resolves.toEqual({ seed: vector.mnemonic });
      // The chooser's lookup client is gone again; a transfer uses the active network's own.
      await state.networkService.tonApiHandler.initApi(tonNetwork);
      expect(await signedBy(state, sendBlockchainMessage, vector.address, vector.publicKeyHex)).toBe(true);
    }
  });

  it('reopens a TON wallet that 3.0.x created from a native TON phrase', async () => {
    for (const vector of [nativeOnly[0], nativeOnly[4], nativeOnly[5]]) {
      const { candidates, create, getAccount, keyringService, sendBlockchainMessage, state } = await background();
      const offered = await candidates(vector.mnemonic);

      // One address, so nothing is asked of the network before the import.
      expect(offered).toEqual([{ derivation: 'native', address: vector.address, activity: 'unknown' }]);
      expect(getAccount).not.toHaveBeenCalled();

      await expect(create(vector.mnemonic, { derivation: 'native', address: vector.address })).resolves.toBe(vector.address);

      const record = stored(vector.address);
      expect(record).toMatchObject({ address: vector.address, publicKeyHex: vector.publicKeyHex });
      expect(decrypt(record)).toBe(vector.mnemonic);
      expect(record.meta).toMatchObject({ tonDerivation: 'native', tonAddress: vector.address });
      expect(tonPublicAccount(record)).not.toHaveProperty('derivationPath');
      await expect(
        keyringService.exportAccountMnemonic({ address: vector.address, password: MASTER_PASSWORD, walletEcosystem: WalletEcosystem.Ton })
      ).resolves.toEqual({ seed: vector.mnemonic });
      await state.networkService.tonApiHandler.initApi(tonNetwork);
      expect(await signedBy(state, sendBlockchainMessage, vector.address, vector.publicKeyHex)).toBe(true);
    }
  });

  it('adds the other address of the same phrase as a second wallet without touching the first', async () => {
    const { candidates, create, keyringService } = await background();
    const [universal, legacy] = await candidates(REAL_BUILD.mnemonic);

    await create(REAL_BUILD.mnemonic, { derivation: legacy.derivation, address: legacy.address }, 'Fearless 3.0 TON');
    const first = JSON.stringify(stored(legacy.address));

    await expect(create(REAL_BUILD.mnemonic, { derivation: universal.derivation, address: universal.address }, 'TON')).resolves.toBe(
      universal.address
    );

    expect(JSON.stringify(stored(legacy.address))).toBe(first);
    expect(stored(universal.address).meta).toMatchObject({ tonDerivation: 'universal' });
    expect(tonPublicAccount(stored(universal.address)).derivationPath).toBe(vectors.vectors[0].expected.ton.derivationPath);
    expect(keyringService.tonKeyring.getAccounts().map(({ address }) => address).sort()).toEqual([legacy.address, universal.address].sort());
  });

  it('offers a native phrase that also passes BIP39 at the address 3.0.x stored for it', async () => {
    const [vector] = nativeAndBip39;
    const { candidates, create } = await background();
    const offered = await candidates(vector.mnemonic);

    expect(offered.map(({ derivation }) => derivation)).toEqual(['universal', 'native']);
    expect(offered[1].address).toBe(vector.address);
    await expect(create(vector.mnemonic, { derivation: 'native', address: vector.address })).resolves.toBe(vector.address);
    expect(stored(vector.address)).toMatchObject({ publicKeyHex: vector.publicKeyHex });
    expect(stored(vector.address).meta).toMatchObject({ tonDerivation: 'native' });
  });

  it('saves nothing when the chosen address is not the one the phrase opens', async () => {
    const { candidates, create, keyringService } = await background();
    const [universal, legacy] = await candidates(REAL_BUILD.mnemonic);

    await expect(create(REAL_BUILD.mnemonic, { derivation: 'fearless-legacy', address: universal.address })).rejects.toMatchObject({
      code: 'account_key_mismatch',
    });
    await expect(create(REAL_BUILD.mnemonic, { derivation: 'native', address: legacy.address })).rejects.toMatchObject({
      code: 'unsupported_ton_derivation',
    });
    await expect(create(bip39Vectors.vectors[1].mnemonic, { derivation: 'fearless-legacy', address: legacy.address })).rejects.toMatchObject({
      code: 'account_key_mismatch',
    });
    await expect(create('not a recovery phrase', { derivation: 'native', address: legacy.address })).rejects.toMatchObject({
      code: 'invalid_mnemonic',
    });

    expect(tonStore.set).not.toHaveBeenCalled();
    expect(mocks.records.size).toBe(0);
    expect(keyringService.tonKeyring.getAccounts()).toEqual([]);
  });

  it('keeps the address of a newly created wallet when no choice is passed', async () => {
    const { create } = await background();
    const [golden] = vectors.vectors;
    const [native] = nativeOnly;

    await expect(create(golden.mnemonic)).resolves.toBe(golden.expected.ton.addressNonBounceable);
    expect(stored(golden.expected.ton.addressNonBounceable).meta).toMatchObject({ tonDerivation: 'universal' });
    expect(tonPublicAccount(stored(golden.expected.ton.addressNonBounceable)).derivationPath).toBe(golden.expected.ton.derivationPath);

    await expect(create(native.mnemonic)).resolves.toBe(native.address);
    expect(stored(native.address).meta).toMatchObject({ tonDerivation: 'native' });
  });
});

describe('restoring a TON wallet the Android app stored as typed', PBKDF2_SUITE, () => {
  it('saves the text exactly as typed, exports it unchanged and signs with the stored key', async () => {
    for (const variant of ['trailing-space', 'double-space', 'upper']) {
      const vector = androidVectors.vectors.find((candidate) => candidate.variant === variant && candidate.kind === 'ton-native')!;
      const { candidates, create, keyringService, sendBlockchainMessage, state } = await background();
      const offered = await candidates(vector.typedText);
      const asTyped = offered.find(({ derivation }) => derivation === 'as-typed')!;

      expect(offered.map(({ derivation }) => derivation)).toEqual(['native', 'as-typed']);

      await expect(create(vector.typedText, { derivation: 'as-typed', address: asTyped.address })).resolves.toBe(asTyped.address);

      const record = stored(asTyped.address);
      expect(record.publicKeyHex).toBe(vector.publicKeyHex);
      // Never tidied: the spacing and capitals are part of this key.
      expect(decrypt(record)).toBe(vector.typedText);
      expect(record.meta).toMatchObject({ tonDerivation: 'as-typed', tonPublicKeyHex: vector.publicKeyHex });
      expect(tonPublicAccount(record)).not.toHaveProperty('derivationPath');
      await expect(
        keyringService.exportAccountMnemonic({ address: asTyped.address, password: MASTER_PASSWORD, walletEcosystem: WalletEcosystem.Ton })
      ).resolves.toEqual({ seed: vector.typedText });
      await state.networkService.tonApiHandler.initApi(tonNetwork);
      expect(await signedBy(state, sendBlockchainMessage, asTyped.address, vector.publicKeyHex)).toBe(true);
    }
  });

  it('saves the tidied phrase when the tidied phrase is what opened the Android wallet', async () => {
    const vector = androidVectors.vectors.find(({ kind, variant }) => kind === 'bip39' && variant === 'canonical')!;
    const { candidates, create } = await background();
    const legacy = (await candidates(`${vector.typedText}\n`)).find(({ derivation }) => derivation === 'fearless-legacy')!;

    await create(`${vector.typedText}\n`, { derivation: 'fearless-legacy', address: legacy.address });

    expect(stored(legacy.address).publicKeyHex).toBe(vector.publicKeyHex);
    expect(decrypt(stored(legacy.address))).toBe(vector.typedText);
  });
});

describe('importing a TON address that is already in the wallet', PBKDF2_SUITE, () => {
  it('marks it on the chooser and keeps its record as it is', async () => {
    const { candidates, create } = await background();
    const [, legacy] = await candidates(REAL_BUILD.mnemonic);

    await create(REAL_BUILD.mnemonic, { derivation: legacy.derivation, address: legacy.address }, 'Fearless 3.0 TON');
    const first = JSON.stringify(stored(legacy.address));
    vi.mocked(tonStore.set).mockClear();
    vi.mocked(tonStore.updateAndWait).mockClear();

    const [universalAgain, legacyAgain] = await candidates(REAL_BUILD.mnemonic);
    expect(legacyAgain).toMatchObject({ address: legacy.address, inWallet: true });
    expect(universalAgain).not.toHaveProperty('inWallet');

    await expect(create(REAL_BUILD.mnemonic, { derivation: legacy.derivation, address: legacy.address }, 'Renamed')).resolves.toBe(
      legacy.address
    );

    expect(tonStore.set).not.toHaveBeenCalled();
    expect(tonStore.updateAndWait).not.toHaveBeenCalled();
    expect(JSON.stringify(stored(legacy.address))).toBe(first);
  });

  it('repairs, from the typed phrase, a 3.0.x record whose phrase only opens with an earlier password', async () => {
    // As 3.0.5 left it after a master-password change: no meta, phrase under the old password.
    mocks.records.set(REAL_BUILD.address, {
      name: 'TON from BIP39',
      address: REAL_BUILD.address,
      cipherSeed: CryptoJS.AES.encrypt(REAL_BUILD.mnemonic, 'earlier master password').toString(),
      publicKeyHex: REAL_BUILD.publicKeyHex,
    } as TonStoreAccount);
    const { create, keyringService } = await background();

    await expect(
      keyringService.exportAccountMnemonic({ address: REAL_BUILD.address, password: MASTER_PASSWORD, walletEcosystem: WalletEcosystem.Ton })
    ).rejects.toMatchObject({ code: 'ton_seed_needs_previous_password' });

    await expect(create(REAL_BUILD.mnemonic, { derivation: 'fearless-legacy', address: REAL_BUILD.address }, 'Renamed')).resolves.toBe(
      REAL_BUILD.address
    );

    // Only the ciphertext changed; name and public key are the record 3.0.5 wrote.
    expect(stored(REAL_BUILD.address)).toMatchObject({ name: 'TON from BIP39', publicKeyHex: REAL_BUILD.publicKeyHex });
    expect(stored(REAL_BUILD.address)).not.toHaveProperty('meta');
    expect(decrypt(stored(REAL_BUILD.address))).toBe(REAL_BUILD.mnemonic);
    expect(tonStore.set).not.toHaveBeenCalled();
    await expect(
      keyringService.exportAccountMnemonic({ address: REAL_BUILD.address, password: MASTER_PASSWORD, walletEcosystem: WalletEcosystem.Ton })
    ).resolves.toEqual({ seed: REAL_BUILD.mnemonic });
  });
});

describe('TON address lookup for the import chooser', PBKDF2_SUITE, () => {
  it('reports what the network says about each address and leaves the wallet as it was', async () => {
    const { candidates, destroyApi, getAccount, initApi, setBalanceItem, tonApi } = await background((address) =>
      address === REAL_BUILD.address ? { balance: 12_340_000_000n, status: 'active' } : { balance: 0n, status: 'nonexist' }
    );

    const [universal, legacy] = await candidates(REAL_BUILD.mnemonic);

    expect(universal).toEqual({ derivation: 'universal', address: universal.address, activity: 'empty', balance: '0' });
    expect(legacy).toEqual({ derivation: 'fearless-legacy', address: REAL_BUILD.address, activity: 'active', balance: '12.34' });
    expect(getAccount).toHaveBeenCalledTimes(2);
    // Nothing is cached for addresses that are not in the wallet, and the temporary client is removed.
    expect(setBalanceItem).not.toHaveBeenCalled();
    expect(initApi).toHaveBeenCalledOnce();
    expect(destroyApi).toHaveBeenCalledWith(NETWORK_NAME);
    expect(tonApi).toEqual({});
    expect(mocks.records.size).toBe(0);
  });

  it('counts an address that only ever received funds, or spent them all, as used', async () => {
    const statuses: Record<string, unknown> = {};
    const { candidates } = await background((address) => statuses[address]);
    const [universal, legacy] = (await deriveTonImportCandidates(REAL_BUILD.mnemonic)).map(({ address }) => address);
    statuses[universal] = { balance: 5_000_000n, status: 'uninit' };
    statuses[legacy] = { balance: 0n, status: 'active' };

    expect((await candidates(REAL_BUILD.mnemonic)).map(({ activity, balance }) => ({ activity, balance }))).toEqual([
      { activity: 'active', balance: '0.005' },
      { activity: 'active', balance: '0' },
    ]);
  });

  it('answers "unknown", never a guess, when an address cannot be checked', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { candidates, state } = await background((address) => {
      if (address === REAL_BUILD.address) throw new Error('404 Not Found');

      return { balance: 0n, status: 'nonexist' };
    });

    expect((await candidates(REAL_BUILD.mnemonic)).map(({ activity, balance }) => ({ activity, balance }))).toEqual([
      { activity: 'empty', balance: '0' },
      { activity: 'unknown' },
    ]);

    // No TON network in the registry at all: still two addresses to choose from.
    (state.networkService as { networksGithub: NetworkJson[] }).networksGithub = [];
    expect((await candidates(REAL_BUILD.mnemonic)).map(({ activity }) => activity)).toEqual(['unknown', 'unknown']);
  });

  it('stops waiting for a provider that does not answer', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { candidates } = await background(() => new Promise(() => {}));
    const derived = await deriveTonImportCandidates(REAL_BUILD.mnemonic);

    vi.useFakeTimers();
    const pending = candidates(REAL_BUILD.mnemonic);
    await vi.advanceTimersByTimeAsync(60_000);
    vi.useRealTimers();

    expect(await pending).toEqual(derived.map(({ derivation, address }) => ({ derivation, address, activity: 'unknown' })));
  });

  it('uses and keeps the TON client of a wallet that already has one', async () => {
    const { candidates, destroyApi, initApi, state, tonApi } = await background(() => ({ balance: 0n, status: 'nonexist' }));
    await state.networkService.tonApiHandler.initApi(tonNetwork);
    vi.mocked(initApi).mockClear();

    await candidates(REAL_BUILD.mnemonic);

    expect(initApi).not.toHaveBeenCalled();
    expect(destroyApi).not.toHaveBeenCalled();
    expect(Object.keys(tonApi)).toEqual([NETWORK_NAME.toLowerCase()]);
  });
});
