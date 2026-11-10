import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cryptoWaitReady, decodeAddress, mnemonicToMiniSecret, sr25519PairFromSeed } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import { keyring } from '@subwallet/ui-keyring';
import { BehaviorSubject } from 'rxjs';

const fixture = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  runtime: { lastError: undefined as { message: string } | undefined, getURL: (path: string) => path },
}));
vi.mock('@subwallet/keyring/pair/nobody', () => ({ nobody: () => { throw new Error('Unused development pair'); } }));
vi.mock('@/consts/global', async (original) => ({ ...(await original<Record<string, unknown>>()), IS_EXTENSION: true }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: {
  runtime: fixture.runtime,
  storage: { local: {
    get: (keys: string[] | null, callback: (data: Record<string, unknown>) => void) => {
      setTimeout(() => callback(structuredClone(keys
        ? Object.fromEntries(keys.map((key) => [key, fixture.data[key]]).filter(([, value]) => value !== undefined))
        : fixture.data)));
    },
    set: (data: Record<string, unknown>, callback: () => void) => {
      const snapshot = structuredClone(data);
      setTimeout(() => { Object.assign(fixture.data, snapshot); callback(); });
    },
    remove: (keys: string | string[], callback: () => void) => {
      setTimeout(() => { [keys].flat().forEach((key) => delete fixture.data[key]); callback(); });
    },
  } },
} }));
vi.mock('@extension-base/services/keyring-service/LegacyNetworkEnrollment', () => ({ enrollLegacyAccountNetworks: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));

import { KeyringService } from '@extension-base/services/keyring-service';
import { TonKeyringService } from '@extension-base/services/keyring-service/TonKeyring';
import AccountsStore from '@extension-base/stores/Accounts';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import CurrentAccountStore from '@extension-base/stores/CurrentAccountStore';
import { decryptForCosigner, encryptForCosigners } from '@/sora/cosigner';
import { WalletEcosystem } from '@/interfaces';

const PASSWORD = 'Public cosigner fixture password';
// Public test phrases with no funds.
const PHRASE = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';
const COSIGNER = sr25519PairFromSeed(mnemonicToMiniSecret('legal winner thank year wave sausage worth useful legal winner thank yellow'));
const COSIGNER_ADDRESS = 'public-cosigner';
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
  keyring.keyring.changeMasterPassword(PASSWORD);
  service = Object.create(KeyringService.prototype);
  Object.assign(service, { password: PASSWORD, tonKeyring: new TonKeyringService(service),
    currentAccountStore: new CurrentAccountStore(), currentAccountSubject: new BehaviorSubject(null),
    selectionRevision: 0, selectionRequestRevision: 0,
    accountAccess: { scheduleScan: vi.fn(), flagPreviousMasterPair: vi.fn() }, scheduleLegacyNetworkEnrollment: vi.fn() });
});
afterEach(async () => {
  await BaseExtensionStore.flush().catch(() => undefined);
  vi.restoreAllMocks();
});

const wallet = (suffix: string) =>
  service.addAccount(`${PHRASE}${suffix}`, { name: 'Cosigner', ethereumAddress: '' }, WalletEcosystem.Substrate, 'sr25519');

describe('SORA cosigner envelopes of a wallet made with a derivation path or password', () => {
  // The cosigner key was the phrase's root key, not the key behind the wallet's address.
  for (const suffix of ['//staking', '///public-bip39-password']) {
    it(`opens an envelope sent to the wallet's own public key, and sends one the cosigner opens (${suffix})`, async () => {
      const address = await wallet(suffix);
      const walletPublicKey = decodeAddress(address);

      // Envelopes carry JSON, such as a multisig call to approve.
      const incoming = encryptForCosigners(JSON.stringify({ call: '0x0102' }), { [address]: walletPublicKey }, COSIGNER.secretKey);
      expect(service.decryptForCosigner({ address, data: incoming, encryptorPublicKey: COSIGNER.publicKey })).toEqual({ call: '0x0102' });

      const outgoing = service.encryptByCosigner({
        address, data: JSON.stringify({ call: '0x0304' }), cosigners: { [COSIGNER_ADDRESS]: u8aToHex(COSIGNER.publicKey) },
      });
      expect(decryptForCosigner(COSIGNER_ADDRESS, walletPublicKey, outgoing, COSIGNER.secretKey)).toEqual({ call: '0x0304' });
    }, 60_000);
  }

  it('keeps the key of a wallet made from the phrase alone, so existing envelopes still open', async () => {
    const address = await wallet('');
    const key = service.accountExportSecretKey({ address, password: PASSWORD });

    expect(u8aToHex(key!)).toBe(u8aToHex(sr25519PairFromSeed(mnemonicToMiniSecret(PHRASE)).secretKey));
  }, 60_000);
});
