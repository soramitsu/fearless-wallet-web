import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cryptoWaitReady, randomAsU8a } from '@polkadot/util-crypto';

const mocks = vi.hoisted(() => ({
  current: undefined as KeyringPair | undefined,
  record: undefined as KeyringPair$Json | undefined,
  decode: vi.fn(),
}));
vi.mock('@subwallet/ui-keyring', () => ({ keyring: { getPair: () => mocks.current, accounts: { add: vi.fn() } } }));
vi.mock('@extension-base/stores/Accounts', () => ({ default: class {
  async getAndWait() { return structuredClone(mocks.record); }
  async updateAndWait(_key, transform, publish) {
    const next = transform(structuredClone(mocks.record));
    if (!next) return;
    mocks.record = next;
    publish?.(next);
    return next;
  }
} }));
vi.mock('@/util/keyringJson', () => ({ decodeMnemonicFromJsonBackup: mocks.decode }));
// CJS TON dependencies and the keyring must share one Buffer implementation in the Node test runner.
vi.mock('vite-plugin-node-polyfills/shims/buffer', async () => {
  const { createRequire } = await import('node:module');
  const { Buffer } = createRequire(import.meta.url)('node:buffer');
  return { default: Buffer, Buffer };
});

import { enrollLegacyAccountNetworks } from '@extension-base/services/keyring-service/LegacyNetworkEnrollment';
import {
  balanceServiceFundsProbe,
  findUniversalWalletLegacyNetworks,
  matchUniversalWalletPassphrase,
  probeUniversalWalletLegacyAccounts,
  withProtectedUniversalWalletAccounts,
  type UniversalWalletFundsProbe,
} from '@extension-base/services/keyring-service/UniversalWalletPassword';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import passphraseVectors from '../../docs/universal-wallet-v2-passphrase-vectors.json';
import type { KeyringPair, KeyringPair$Json } from '@subwallet/keyring/types';
import type BalanceService from '@extension-base/services/balance-service';
import type { FWKeyringMeta } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { deriveUniversalWalletKeyringFields } from '@/util/universalWalletKeyringFields';
import { withUniversalWalletKeyringMeta } from '@/util/universalWalletKeyringMeta';
import {
  openUniversalWalletPassphrase,
  sealUniversalWalletPassphrase,
  type UniversalWalletPasswordNetwork,
} from '@/util/universalWalletPassphrase';

const MNEMONIC = vectors.vectors[0].mnemonic;
const PASSWORD = passphraseVectors.vectors[0].passphrase;
const LEGACY = deriveUniversalWalletKeyringFields(MNEMONIC);
const PROTECTED = deriveUniversalWalletKeyringFields(MNEMONIC, PASSWORD);

function fixture(meta: FWKeyringMeta = {}): KeyringPair {
  const pair = {
    address: '5PasswordWalletFixture', type: 'sr25519', publicKey: new Uint8Array(32).fill(7),
    meta: { name: 'Password wallet', isMasterPassword: true, walletEcosystem: WalletEcosystem.Substrate, ...meta },
    setMeta(next) { this.meta = { ...this.meta, ...next }; },
  } as unknown as KeyringPair;
  mocks.current = pair;
  mocks.record = { address: pair.address, encoded: 'ciphertext', encoding: { content: ['pkcs8', 'sr25519'],
    type: ['scrypt', 'xsalsa20-poly1305'], version: '3' }, meta: { ...pair.meta } } as KeyringPair$Json;
  return pair;
}

const enroll = (pair: KeyringPair, passphrase: string, probe?: UniversalWalletFundsProbe) =>
  enrollLegacyAccountNetworks(pair, 'master', () => true, async () => {}, { passphrase: () => passphrase, probe });
const probeAll = (funds: Partial<Record<UniversalWalletPasswordNetwork, 'funded' | 'empty' | 'unknown'>>) =>
  vi.fn<UniversalWalletFundsProbe>(async (network) => funds[network] ?? 'empty');

beforeAll(async () => { await cryptoWaitReady(); });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.decode.mockReturnValue(MNEMONIC);
});

describe('networks a password wallet gains later (backfill)', () => {
  it('adds protected accounts, keeping each no-password address that is funded or unchecked', async () => {
    const pair = fixture();
    const probe = probeAll({ bitcoin: 'funded', ton: 'unknown' });

    await enroll(pair, PASSWORD, probe);

    expect(probe).toHaveBeenCalledTimes(5);
    expect(pair.meta).toMatchObject({
      bitcoinAddress: LEGACY.bitcoinAddress,
      tonPublicKeyHex: LEGACY.tonPublicKeyHex,
      bitcoinTestnetAddress: PROTECTED.bitcoinTestnetAddress,
      solanaAddress: PROTECTED.solanaAddress,
      irohaAddress: PROTECTED.irohaAddress,
      irohaPublicKeyHex: PROTECTED.irohaPublicKeyHex,
      universalWalletLegacyNetworks: ['bitcoin', 'ton'],
    });
  });

  it('keeps every no-password address when nothing can check them', async () => {
    const pair = fixture();

    await enroll(pair, PASSWORD);

    expect(pair.meta).toMatchObject({ ...LEGACY, universalWalletLegacyNetworks: ['bitcoin', 'bitcoinTestnet', 'solana', 'ton', 'iroha'] });
  });

  it('never probes or changes anything for a wallet without a password', async () => {
    const pair = fixture();
    const probe = probeAll({});

    await enroll(pair, '', probe);

    expect(probe).not.toHaveBeenCalled();
    expect(pair.meta).toMatchObject(LEGACY);
    expect((pair.meta as FWKeyringMeta).universalWalletLegacyNetworks).toBeUndefined();
  });

  it('never replaces an address the wallet already shows, even an empty one', async () => {
    const pair = fixture({ solanaAddress: LEGACY.solanaAddress, bitcoinAddress: LEGACY.bitcoinAddress });

    await enroll(pair, PASSWORD, probeAll({}));

    expect(pair.meta).toMatchObject({
      solanaAddress: LEGACY.solanaAddress,
      bitcoinAddress: LEGACY.bitcoinAddress,
      bitcoinTestnetAddress: PROTECTED.bitcoinTestnetAddress,
      tonAddress: PROTECTED.tonAddress,
    });
    expect((pair.meta as FWKeyringMeta).universalWalletLegacyNetworks).toBeUndefined();
  });
});

describe('Universal Wallet password helpers', () => {
  it('opens a sealed password only with the account secret that sealed it', () => {
    const secret = randomAsU8a(64);
    const publicKey = randomAsU8a(32);
    const sealed = sealUniversalWalletPassphrase('pässwörd ＦＷ', secret, publicKey);

    expect(openUniversalWalletPassphrase(sealed, secret, publicKey)).toBe('pässwörd ＦＷ');
    expect(openUniversalWalletPassphrase(sealed, randomAsU8a(64), publicKey)).toBeNull();
    expect(openUniversalWalletPassphrase(sealed, secret, randomAsU8a(32))).toBeNull();
    expect(openUniversalWalletPassphrase({ ...sealed, sealed: `00${sealed.sealed.slice(2)}` }, secret, publicKey)).toBeNull();
    expect(openUniversalWalletPassphrase({ version: 2 }, secret, publicKey)).toBeNull();
    expect(JSON.stringify(sealed)).not.toContain('pässwörd');
  });

  it('tells which passphrase opens each stored account', () => {
    const mixed = { ...PROTECTED, solanaAddress: LEGACY.solanaAddress } as FWKeyringMeta;

    expect(matchUniversalWalletPassphrase(mixed, 'bitcoin', MNEMONIC, [PASSWORD])).toBe(PASSWORD);
    expect(matchUniversalWalletPassphrase(mixed, 'solana', MNEMONIC, [PASSWORD])).toBe('');
    expect(matchUniversalWalletPassphrase(mixed, 'ton', MNEMONIC, ['other', PASSWORD])).toBe(PASSWORD);
    expect(matchUniversalWalletPassphrase({ bitcoinAddress: 'bc1qforeign' }, 'bitcoin', MNEMONIC, [PASSWORD])).toBeUndefined();
    expect(findUniversalWalletLegacyNetworks(mixed, MNEMONIC, PASSWORD)).toEqual(['solana']);
    expect(findUniversalWalletLegacyNetworks(mixed, MNEMONIC, '')).toEqual([]);
  });

  it('moves only the switched networks and rebuilds their public accounts', () => {
    const meta = withUniversalWalletKeyringMeta('5Wallet', {
      ...LEGACY, walletEcosystem: WalletEcosystem.Substrate, universalWalletLegacyNetworks: ['bitcoin', 'solana'],
    } as FWKeyringMeta, WalletEcosystem.Substrate);

    const next = withProtectedUniversalWalletAccounts('5Wallet', meta, MNEMONIC, PASSWORD, ['bitcoin']);

    expect(next).toMatchObject({ bitcoinAddress: PROTECTED.bitcoinAddress, solanaAddress: LEGACY.solanaAddress,
      universalWalletLegacyNetworks: ['solana'] });
    const accounts = Object.fromEntries(next.universalWallet!.publicAccounts.map(({ accountId, address }) => [accountId, address]));
    expect(accounts['bitcoin-mainnet']).toBe(PROTECTED.bitcoinAddress);
    expect(accounts['solana-mainnet']).toBe(LEGACY.solanaAddress);
    expect(withProtectedUniversalWalletAccounts('5Wallet', next, MNEMONIC, PASSWORD, ['solana']).universalWalletLegacyNetworks)
      .toBeUndefined();
  });

  it('probes no-password addresses and treats every failure as unchecked', async () => {
    const probe = vi.fn<UniversalWalletFundsProbe>(async (network) => {
      if (network === 'solana') throw new Error('rpc down');
      return 'empty';
    });

    const found = await probeUniversalWalletLegacyAccounts(probe, MNEMONIC);

    expect(found.map(({ network, address, funds }) => [network, address, funds])).toEqual([
      ['bitcoin', LEGACY.bitcoinAddress, 'empty'],
      ['bitcoinTestnet', LEGACY.bitcoinTestnetAddress, 'empty'],
      ['solana', LEGACY.solanaAddress, 'unknown'],
      ['ton', LEGACY.tonAddress, 'empty'],
      ['iroha', LEGACY.irohaAddress, 'empty'],
    ]);
  });

  it('asks each balance client about the right address and reads TON by balance', async () => {
    const balances = {
      bitcoinBalanceService: { probeAccountFunds: vi.fn(async () => 'funded') },
      solanaBalanceService: { probeAddressFunds: vi.fn(async () => 'empty') },
      irohaBalanceService: { probeAddressFunds: vi.fn(async () => 'unknown') },
      tonBalanceService: { fetchAddressActivity: vi.fn() },
    };
    const probe = balanceServiceFundsProbe(balances as unknown as BalanceService);

    expect(await probe('bitcoin', MNEMONIC, {})).toBe('funded');
    expect(await probe('bitcoinTestnet', MNEMONIC, {})).toBe('funded');
    expect(balances.bitcoinBalanceService.probeAccountFunds.mock.calls).toEqual([[MNEMONIC, 'mainnet'], [MNEMONIC, 'testnet']]);
    expect(await probe('solana', MNEMONIC, { solanaAddress: LEGACY.solanaAddress })).toBe('empty');
    expect(balances.solanaBalanceService.probeAddressFunds).toHaveBeenCalledWith(LEGACY.solanaAddress);
    expect(await probe('iroha', MNEMONIC, { irohaAddress: LEGACY.irohaAddress })).toBe('unknown');
    expect(await probe('solana', MNEMONIC, {})).toBe('unknown');

    const ton = (activity: string, balance?: string) =>
      balances.tonBalanceService.fetchAddressActivity.mockResolvedValueOnce({ [LEGACY.tonAddress]: { activity, balance } });
    ton('active', '0');
    expect(await probe('ton', MNEMONIC, { tonAddress: LEGACY.tonAddress })).toBe('empty');
    ton('active', '1.25');
    expect(await probe('ton', MNEMONIC, { tonAddress: LEGACY.tonAddress })).toBe('funded');
    ton('unknown');
    expect(await probe('ton', MNEMONIC, { tonAddress: LEGACY.tonAddress })).toBe('unknown');
  });
});
