import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { stringToHex } from '@polkadot/util';
import { Wallet, verifyMessage } from 'ethers';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The account cryptography is real (@polkadot/keyring pairs, as in keyring-recovery.spec.ts); only the
// ui-keyring bookkeeping and the WalletConnect request plumbing are stand-ins.
const mocks = vi.hoisted(() => ({
  backend: undefined as unknown as Keyring,
  hash: '',
  master: '',
  stored: new Map<string, KeyringPair$Json>(),
  update: vi.fn(),
}));
vi.mock('@subwallet/ui-keyring', () => ({
  keyring: {
    keyring: {
      get hasMasterPassword() {
        return !!mocks.hash;
      },
      get isLocked() {
        return !mocks.master;
      },
      createJsonPairWithMasterPassword: (pair: KeyringPair) => {
        if (!mocks.master) throw new Error('Please unlock first');
        return pair.toJson(mocks.master);
      },
      addFromJson: (json: KeyringPair$Json) => mocks.backend.addFromJson(json),
    },
    getPair: (address: string) => mocks.backend.getPair(address),
    getAccounts: () => mocks.backend.getPairs().map(({ address, meta }) => ({ address, meta })),
    getAddresses: () => [],
    createFromJson: (json: KeyringPair$Json) => mocks.backend.createFromJson(json),
    unlockKeyring: (password: string) => {
      if (!mocks.hash || password !== mocks.hash) throw new Error('Invalid master password');
      mocks.master = password;
    },
    unlockPair: (address: string) => {
      if (!mocks.master) throw new Error('Please unlock first');
      const pair = mocks.backend.getPair(address);
      try {
        pair.decodePkcs8(mocks.master);
      } catch {
        throw new Error(`Fail to unlock with address: ${address}`);
      }
    },
    backupAccount: (pair: KeyringPair, password: string) => {
      if (!pair.isLocked) pair.lock();
      pair.decodePkcs8(password);
      return pair.toJson(password);
    },
    lockAll: () => {
      mocks.master = '';
      mocks.backend.getPairs().forEach((pair) => pair.lock());
    },
    accounts: { add: vi.fn() },
  },
}));
vi.mock('@extension-base/stores/Accounts', () => ({
  default: class {
    updateAndWait = mocks.update;
  },
}));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@extension-base/stores/CurrentAccountStore', () => ({ default: class {} }));
vi.mock('@extension-base/stores/KeyringStore', () => ({ default: class {} }));
vi.mock('@extension-base/stores/KeyringStoreWeb', () => ({ default: class {} }));
vi.mock('@extension-base/stores/LegacyPasswordPromptStore', () => ({
  default: class {
    getAndWait = async () => undefined;
  },
}));
vi.mock('@extension-base/services/keyring-service/TonKeyring', () => ({ TonKeyringService: class {} }));
vi.mock('@extension-base/services/keyring-service/LegacyNetworkEnrollment', () => ({
  enrollLegacyAccountNetworks: vi.fn(),
}));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
// Extension is exercised through its prototype; its services are never built.
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));

import { KeyringService } from '@extension-base/services/keyring-service';
import { accountStorageKey } from '@extension-base/services/keyring-service/AccountMetadata';
import { TonSeedVault } from '@extension-base/services/keyring-service/TonSeedVault';
import Extension from '@extension-base/background/handlers/Extension';
import type { KeyringPair, KeyringPair$Json } from '@polkadot/keyring/types';

// Public test phrase only; never fund it.
const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const EVM_PATH = "/m/44'/60'/0'/0/0";
const PARENT_PASSWORD = '2.6.3 parent password';
const CHILD_PASSWORD = '2.6.3 child json password';
const MASTER = 'current master password';
const TOPIC = 'wc-topic';
// Every step is real scrypt (N = 2^15).
const SCRYPT_SUITE = { timeout: 120_000 };

function storedAccount(
  suri: string,
  type: 'sr25519' | 'ethereum',
  password: string,
  meta: Record<string, unknown>
): KeyringPair {
  const json = mocks.backend.createFromUri(suri, meta, type).toJson(password);
  const pair = mocks.backend.addFromJson(json);
  mocks.stored.set(accountStorageKey(pair as never), json);
  return pair;
}

function unlockedKeyring(): KeyringService {
  const keyring = Object.create(KeyringService.prototype) as KeyringService;
  const tonKeyring = { getAccounts: () => [], accountSubject: { value: {} } };
  Object.defineProperty(keyring, 'tonKeyring', {
    value: { ...tonKeyring, vault: new TonSeedVault({ ...tonKeyring, setAccounts: () => {} }) },
  });
  expect(keyring.unlockKeyring({ password: MASTER })).toBe(true);
  return keyring;
}

// The 3.0.5-era cohort E2 made reachable: the EVM account was migrated on its own (with its JSON
// password); its Substrate parent still waits for its legacy password.
async function parentPendingChildMigrated() {
  const child = storedAccount(`${MNEMONIC}${EVM_PATH}`, 'ethereum', CHILD_PASSWORD, { name: '' });
  const parent = storedAccount(MNEMONIC, 'sr25519', PARENT_PASSWORD, {
    name: 'Parent',
    ethereumAddress: child.address,
  });
  const keyringService = unlockedKeyring();

  await expect(
    keyringService.keyringMigrateMasterPassword({ address: child.address, password: CHILD_PASSWORD })
  ).resolves.toBe(true);
  expect(() => keyringService.unlockPair(parent.address)).toThrow('legacy_password_required');

  return { child, parent, keyringService };
}

beforeAll(async () => {
  await cryptoWaitReady();
});

beforeEach(() => {
  mocks.backend = new Keyring({ type: 'sr25519' });
  mocks.stored.clear();
  mocks.hash = MASTER;
  mocks.master = '';
  mocks.update.mockReset().mockImplementation(async (key: string, transform, publish) => {
    const next = transform(structuredClone(mocks.stored.get(key)));
    if (next === undefined) return undefined;
    mocks.stored.set(key, next);
    publish?.(next);
    return next;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WalletConnect approval with a parent that still needs its legacy password', SCRYPT_SUITE, () => {
  it('reports a personal_sign that the dApp received as approved, once', async () => {
    const { child, parent, keyringService } = await parentPendingChildMigrated();
    const message = 'Sign in to example.dapp';
    const request = {
      request: {
        topic: TOPIC,
        params: {
          chainId: 'eip155:1',
          request: { method: 'personal_sign', params: [stringToHex(message), child.address] },
        },
      },
      resolve: vi.fn(),
      reject: vi.fn(),
    };
    const extension = {
      state: {
        keyringService,
        requestService: { signWcRequest: () => request },
        networkService: { networkMap: { ethereum: { name: 'Ethereum', chainId: '1' } } },
        getEvmApi: () => undefined,
      },
    } as unknown as Extension;

    await expect(
      Extension.prototype.wcRequestApprove.call(extension, { address: parent.address, topic: TOPIC })
    ).resolves.toBe(true);

    expect(request.resolve).toHaveBeenCalledOnce();
    expect(request.reject).not.toHaveBeenCalled();
    const { payload } = request.resolve.mock.calls[0][0];
    expect(verifyMessage(message, payload).toLowerCase()).toBe(child.address.toLowerCase());
    // Nothing was written or unlocked for the parent: it still waits for its own password.
    expect(keyringService.getPair(parent.address)?.meta.isMasterPassword).toBeFalsy();
  });

  it('reports a sent transaction as approved, once, instead of inviting a second payment', async () => {
    const { child, parent, keyringService } = await parentPendingChildMigrated();
    const send = vi.spyOn(Wallet.prototype, 'sendTransaction').mockResolvedValue({ hash: '0xfeed' } as never);
    const request = {
      request: {
        topic: TOPIC,
        params: {
          chainId: 'eip155:1',
          request: {
            method: 'eth_sendTransaction',
            params: [{ from: child.address, to: child.address, value: '0x1' }],
          },
        },
      },
      resolve: vi.fn(),
      reject: vi.fn(),
    };
    const extension = {
      state: {
        keyringService,
        requestService: { signWcRequest: () => request },
        networkService: { networkMap: { ethereum: { name: 'Ethereum', chainId: '1' } } },
        getEvmApi: () => undefined,
      },
    } as unknown as Extension;

    await expect(
      Extension.prototype.wcRequestApprove.call(extension, { address: child.address, topic: TOPIC })
    ).resolves.toBe(true);

    expect(send).toHaveBeenCalledOnce();
    expect(request.resolve).toHaveBeenCalledExactlyOnceWith({ id: TOPIC, payload: '0xfeed' });
    expect(request.reject).not.toHaveBeenCalled();
    expect(() => keyringService.unlockPair(parent.address)).toThrow('legacy_password_required');
  });
});
