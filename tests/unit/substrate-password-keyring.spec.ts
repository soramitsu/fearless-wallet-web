import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { u8aToHex } from '@polkadot/util';
import { cryptoWaitReady, decodeAddress } from '@polkadot/util-crypto';
import { keyring } from '@subwallet/ui-keyring';
import { BehaviorSubject } from 'rxjs';

const fixture = vi.hoisted(() => ({ data: {} as Record<string, unknown>, runtime: { lastError: undefined, getURL: (path: string) => path } }));
vi.mock('@subwallet/keyring/pair/nobody', () => ({ nobody: () => { throw new Error('Unused development pair'); } }));
vi.mock('@/consts/global', async (original) => ({ ...(await original<Record<string, unknown>>()), IS_EXTENSION: true }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: {
  runtime: fixture.runtime,
  storage: { local: {
    get: (_keys: unknown, callback: (data: Record<string, unknown>) => void) => callback(structuredClone(fixture.data)),
    set: (data: Record<string, unknown>, callback: () => void) => { Object.assign(fixture.data, structuredClone(data)); callback(); },
    remove: (keys: string | string[], callback: () => void) => {
      (typeof keys === 'string' ? [keys] : keys).forEach((key) => delete fixture.data[key]); callback();
    },
  } },
} }));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
vi.mock('@extension-base/services/keyring-service/LegacyNetworkEnrollment', () => ({ enrollLegacyAccountNetworks: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));

import Extension from '@extension-base/background/handlers/Extension';
import { KeyringService } from '@extension-base/services/keyring-service';
import { TonKeyringService } from '@extension-base/services/keyring-service/TonKeyring';
import { importLocalAccount } from '@extension-base/services/keyring-service/LocalAccountImport';
import {
  createSubstratePairFromUri,
  type SubstratePasswordRule,
} from '@extension-base/services/keyring-service/SubstratePassword';
import AccountsStore from '@extension-base/stores/Accounts';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import CurrentAccountStore from '@extension-base/stores/CurrentAccountStore';
import type State from '@extension-base/background/handlers/State';
import type { SubstratePasswordAccountInfo } from '@extension-base/background/types/types';
import type { KeypairType } from '@subwallet/keyring/types';
import { WalletEcosystem } from '@/interfaces';

type Crypto = 'sr25519' | 'ed25519' | 'ecdsa';
type Vector = {
  id: string; mnemonic: string; derivationPath: string; rulesAgree: boolean;
  accounts: Record<SubstratePasswordRule, Record<Crypto, { accountId: string }>>;
};
// Written by scripts/generate-substrate-password-vectors.py (Python standard library only, no client code).
const { vectors } = JSON.parse(readFileSync(resolve(__dirname, '../../docs/substrate-password-vectors.json'), 'utf8')) as { vectors: Vector[] };
const vector = (id: string) => vectors.find((item) => item.id === id)!;
const MASTER_PASSWORD = 'Substrate password restore fixture';
const CRYPTO: Crypto[] = ['sr25519', 'ed25519', 'ecdsa'];
const accountId = (address: string) => u8aToHex(decodeAddress(address));
// AddWallet.vue suriSubstrate: the words and the Advanced path, both trimmed.
const suri = (item: Vector, path = item.derivationPath) => `${item.mnemonic}${path.trim()}`;
let service: KeyringService;

beforeEach(async () => {
  await cryptoWaitReady();
  fixture.data = {};
  for (const subject of [keyring.accounts, keyring.addresses, keyring.contracts]) {
    for (const address of Object.keys(subject.subject.value)) subject.removeSubjectOnly(address);
  }
  vi.spyOn(keyring.keyringOption, 'init').mockImplementation(() => {});
  keyring.loadAll({ type: 'sr25519', isDevelopment: false, store: new AccountsStore(),
    password_store: { get: (callback) => callback(undefined), set: () => {}, remove: () => {} },
  });
  keyring.keyring.changeMasterPassword(MASTER_PASSWORD);
  service = Object.create(KeyringService.prototype);
  Object.assign(service, { password: MASTER_PASSWORD, tonKeyring: new TonKeyringService(service),
    currentAccountStore: new CurrentAccountStore(), currentAccountSubject: new BehaviorSubject(null),
    selectionRevision: 0, selectionRequestRevision: 0, scheduleLegacyNetworkEnrollment: vi.fn(),
    accountAccess: { scheduleScan: vi.fn(), flagPreviousMasterPair: vi.fn(), clearPreviousMasterPair: vi.fn() } });
});
afterEach(async () => {
  await BaseExtensionStore.flush().catch(() => undefined);
  vi.restoreAllMocks();
});

async function importWords(item: Vector, crypto: KeypairType, rule?: SubstratePasswordRule, path = item.derivationPath) {
  return service.addAccount(suri(item, path), { name: item.id }, WalletEcosystem.Substrate, crypto, false, false, rule);
}

// The wallet exactly as an earlier version saved it: that version's key, stored by the same import step.
async function storedByEarlierVersion(item: Vector, rule: SubstratePasswordRule, path = item.derivationPath) {
  const pair = createSubstratePairFromUri(suri(item, path), { name: item.id, walletEcosystem: WalletEcosystem.Substrate }, 'sr25519', rule);
  return service.tonKeyring.vault.exclusive(() => importLocalAccount(pair, WalletEcosystem.Substrate, () => MASTER_PASSWORD));
}

async function forget(address: string) {
  keyring.forgetAccount(address);
  await BaseExtensionStore.flush().catch(() => undefined);
}

describe('Substrate path password in the background keyring', { timeout: 120_000 }, () => {
  it('imports open the account iOS and Android open, for every vector and key type', async () => {
    for (const item of vectors) {
      for (const crypto of CRYPTO) {
        const address = await importWords(item, crypto);
        expect(accountId(address), `${item.id} ${crypto}`).toBe(item.accounts.nfkd[crypto].accountId);
        await forget(address);
      }
    }
  });

  it('an import opens the account an earlier web version made when the user picks it', async () => {
    for (const item of vectors.filter(({ rulesAgree }) => !rulesAgree)) {
      for (const rule of ['nfc', 'asTyped'] as const) {
        const address = await importWords(item, 'ed25519', rule);
        expect(accountId(address), `${item.id} ${rule}`).toBe(item.accounts[rule].ed25519.accountId);
        await forget(address);
      }
    }
  });

  it('new words always get the current rule, whatever the request says', async () => {
    const item = vector('default24-unicode');
    (service as unknown as { securityProvenance: { rememberGeneratedMnemonic(m: string): void } })
      .securityProvenance.rememberGeneratedMnemonic(item.mnemonic);

    const address = await service.addAccount(suri(item), { name: 'Created' }, WalletEcosystem.Substrate, 'sr25519', true, true, 'nfc');

    expect(accountId(address)).toBe(item.accounts.nfkd.sr25519.accountId);
  });

  it('recovery with the words and path reopens a wallet stored by web 4.2, web 3.0 or this version', async () => {
    const composed = vector('default24-unicode');
    const decomposed = vector('default24-unicode-decomposed-input');
    const cases = [
      { label: 'web 4.2 (NFC)', item: composed, rule: 'nfc' as const, storedPath: composed.derivationPath },
      // 3.0 kept the bytes as entered; this one was pasted decomposed, and is recovered with the password typed.
      { label: 'web 3.0 (pasted decomposed)', item: decomposed, rule: 'asTyped' as const, storedPath: decomposed.derivationPath },
      { label: 'this version (NFKD)', item: composed, rule: 'nfkd' as const, storedPath: composed.derivationPath },
    ];
    for (const { label, item, rule, storedPath } of cases) {
      const address = await storedByEarlierVersion(item, rule, storedPath);
      expect(accountId(address), label).toBe(item.accounts[rule].sr25519.accountId);

      const recovered = await service.recoverAccountWithPhrase({
        address, walletEcosystem: WalletEcosystem.Substrate, phrase: composed.mnemonic, derivationPath: composed.derivationPath,
      });

      expect(recovered, label).toEqual({ ok: true });
      expect(keyring.getPair(address).address, label).toBe(address);
      expect(await service.recoverAccountWithPhrase({
        address, walletEcosystem: WalletEcosystem.Substrate, phrase: composed.mnemonic, derivationPath: '//polkadot///other',
      }), label).toEqual({ ok: false, code: 'phrase_mismatch' });
      await forget(address);
    }
  });

  it('the universal "enter the path" check accepts the path of a wallet stored by web 4.2 or 3.0', async () => {
    const composed = vector('default24-unicode');
    const decomposed = vector('default24-unicode-decomposed-input');
    for (const [item, rule] of [[composed, 'nfc'], [decomposed, 'asTyped']] as const) {
      const address = await storedByEarlierVersion(item, rule);

      const result = await service.addUniversalWalletPasswordPath({ address, derivationPath: composed.derivationPath });

      expect(result, `${item.id} ${rule}`).toMatchObject({ ok: true });
      await forget(address);
    }
  });

  it('lists the accounts a typed phrase and path open, marking one already in the wallet', async () => {
    const item = vector('default24-unicode');
    const extension = Object.assign(Object.create(Extension.prototype) as Extension, {
      state: { keyringService: service } as unknown as State,
    });
    const list = (text: string) => Extension.prototype.handle.call(extension, 'id', 'pri(keyring.substratePasswordAccounts)', {
      suri: text, type: 'sr25519',
    }) as Promise<SubstratePasswordAccountInfo[]>;
    const stored = await storedByEarlierVersion(item, 'nfc');

    const accounts = await list(suri(item));

    expect(accounts.map(({ rule }) => rule)).toEqual(['nfkd', 'nfc']);
    expect(accounts.map(({ address }) => accountId(address))).toEqual([
      item.accounts.nfkd.sr25519.accountId, item.accounts.nfc.sr25519.accountId,
    ]);
    expect(accounts.find(({ rule }) => rule === 'nfc')).toEqual({ rule: 'nfc', address: stored, inWallet: true });
    expect(accounts.find(({ rule }) => rule === 'nfkd')?.inWallet).toBeUndefined();
    expect((await list(suri(vector('import12-ascii')))).map(({ rule }) => rule)).toEqual(['nfkd']);
    await forget(stored);
  });
});
