import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enrollLegacyAccountNetworks, needsLegacyNetworkEnrollment } from '@extension-base/services/keyring-service/LegacyNetworkEnrollment';
import { updateAccountMetadata } from '@extension-base/services/keyring-service/AccountMetadata';
import type { KeyringPair, KeyringPair$Json } from '@subwallet/keyring/types';
import type { FWKeyringMeta } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';

const mocks = vi.hoisted(() => ({
  current: undefined as KeyringPair | undefined,
  record: undefined as KeyringPair$Json | undefined,
  decode: vi.fn(), bitcoin: vi.fn(), solana: vi.fn(), ton: vi.fn(), iroha: vi.fn(),
  beforeCommit: vi.fn(), published: vi.fn(), writes: vi.fn(),
}));
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {
  getPair: () => mocks.current, accounts: { add: mocks.published },
} }));
vi.mock('@extension-base/stores/Accounts', () => ({ default: class {
  async getAndWait() { return structuredClone(mocks.record); }
  async updateAndWait(_key, transform, publish) {
    const next = transform(structuredClone(mocks.record));
    if (!next) return;
    await mocks.beforeCommit();
    mocks.writes(next);
    mocks.record = next;
    publish?.(next);
    return next;
  }
} }));
vi.mock('@/util/keyringJson', () => ({ decodeMnemonicFromJsonBackup: mocks.decode }));
vi.mock('@/util/bitcoinKeyring', () => ({ deriveBitcoinReceiveAddress: mocks.bitcoin }));
vi.mock('@/util/solanaKeyring', () => ({ deriveSolanaAddress: mocks.solana }));
vi.mock('@/util/tonKeyring', () => ({ deriveTonAccount: mocks.ton }));
vi.mock('@/util/irohaKeyring', () => ({ deriveIrohaAddress: mocks.iroha }));
import { buildUniversalWalletKeyringMeta } from '@/util/universalWalletKeyringMeta';

const IROHA_KEY = '34eb4b67d64f74d989ce2bc2e3dfddb7ed4cb0eec92f29fbecd05b1eabab0254';
function fixture(meta: FWKeyringMeta = {}, type = 'sr25519'): KeyringPair {
  const pair = {
    address: '5LegacyPublicFixture', type, publicKey: new Uint8Array(32).fill(9),
    meta: { name: 'Original', isMasterPassword: true, ...meta },
    setMeta(next) { this.meta = { ...this.meta, ...next }; },
  } as unknown as KeyringPair;
  mocks.current = pair;
  mocks.record = { address: pair.address, encoded: 'original-ciphertext',
    encoding: { content: ['pkcs8', type], type: ['scrypt', 'xsalsa20-poly1305'], version: '3' },
    meta: { ...pair.meta }, legacyExtension: 'retain me' } as KeyringPair$Json;
  return pair;
}
const enroll = (pair: KeyringPair) => enrollLegacyAccountNetworks(pair, 'fixture-password', () => true, async () => {});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.decode.mockReturnValue('synthetic decoded BIP39 phrase');
  mocks.bitcoin.mockImplementation(({ network }) => network === 'testnet' ? 'tb1new' : 'bc1new');
  mocks.solana.mockReturnValue('solana-new');
  mocks.ton.mockReturnValue({ addressNonBounceable: 'ton-new', publicKeyHex: '12'.repeat(32) });
  mocks.iroha.mockReturnValue({ address: 'taira-new', publicKeyHex: IROHA_KEY });
  mocks.beforeCommit.mockResolvedValue(undefined);
});

describe('optional additive legacy network enrollment', () => {
  it('adds every supported missing network without changing ciphertext, roots or legacy fields', async () => {
    const pair = fixture({ ethereumAddress: 'separately-imported-evm', genesisHash: 'custom-chain' });
    const originalPublicKey = pair.publicKey.slice();
    await enroll(pair);
    expect(pair.publicKey).toEqual(originalPublicKey);
    expect(mocks.decode).toHaveBeenCalledWith(expect.objectContaining({ encoded: 'original-ciphertext' }), 'fixture-password', originalPublicKey);
    expect(mocks.record).toMatchObject({ encoded: 'original-ciphertext', legacyExtension: 'retain me', meta: {
      ethereumAddress: 'separately-imported-evm', genesisHash: 'custom-chain', bitcoinAddress: 'bc1new',
      bitcoinTestnetAddress: 'tb1new', solanaAddress: 'solana-new', tonAddress: 'ton-new',
      tonPublicKeyHex: '12'.repeat(32), irohaAddress: 'taira-new', irohaPublicKeyHex: IROHA_KEY,
      universalWallet: { source: 'legacy-import' },
    } });
    expect(mocks.writes).toHaveBeenCalledTimes(5);
    await enroll(pair);
    expect(mocks.writes).toHaveBeenCalledTimes(5);
  });

  it('preserves independently imported and partially present identities', async () => {
    const pair = fixture({ bitcoinAddress: 'bc1old', solanaAddress: 'solana-old', tonPublicKeyHex: '99'.repeat(32), irohaAddress: 'taira-old' });
    await enroll(pair);
    expect(pair.meta).toMatchObject({ bitcoinAddress: 'bc1old', bitcoinTestnetAddress: 'tb1new',
      solanaAddress: 'solana-old', tonPublicKeyHex: '99'.repeat(32), irohaAddress: 'taira-old' });
    expect(pair.meta.tonAddress).toBeUndefined();
    expect(mocks.ton).not.toHaveBeenCalled();
    expect(mocks.iroha).not.toHaveBeenCalled();
  });

  it('retains custom account descriptors instead of rebuilding their paths and public keys', async () => {
    const meta: FWKeyringMeta = { name: 'Original', walletEcosystem: WalletEcosystem.Substrate };
    meta.universalWallet = buildUniversalWalletKeyringMeta({ address: '5LegacyPublicFixture', meta });
    meta.universalWallet.publicAccounts.push({ accountId: 'old-ton-custom', ecosystem: WalletEcosystem.Ton,
      address: 'old-native-ton', publicKeyHex: '88'.repeat(32), derivationPath: 'legacy-native', isDefault: true });
    const retained = structuredClone(meta.universalWallet.publicAccounts);
    const pair = fixture(meta);
    await enroll(pair);
    expect((pair.meta as FWKeyringMeta).universalWallet?.publicAccounts).toEqual(expect.arrayContaining(retained));
    expect(mocks.ton).not.toHaveBeenCalled();
    expect(pair.meta.tonAddress).toBeUndefined();
  });

  it('continues after an unavailable derivation and retries only the missing network later', async () => {
    const pair = fixture();
    mocks.solana.mockImplementationOnce(() => { throw new Error('Optional SDK unavailable'); }).mockReturnValue('solana-new');
    await expect(enroll(pair)).resolves.toBeUndefined();
    expect(pair.meta.solanaAddress).toBeUndefined();
    expect(pair.meta.irohaAddress).toBe('taira-new');
    await enroll(pair);
    expect(pair.meta.solanaAddress).toBe('solana-new');
    expect(mocks.bitcoin).toHaveBeenCalledTimes(2);
  });

  it('keeps original accounts usable and unpublished when optional storage fails, then retries', async () => {
    const pair = fixture();
    mocks.beforeCommit.mockRejectedValue(new Error('Read-only storage'));
    await expect(enroll(pair)).resolves.toBeUndefined();
    expect(pair.meta.bitcoinAddress).toBeUndefined();
    expect(mocks.record?.encoded).toBe('original-ciphertext');
    expect(mocks.published).not.toHaveBeenCalled();
    mocks.beforeCommit.mockResolvedValue(undefined);
    await enroll(pair);
    expect(pair.meta.bitcoinAddress).toBe('bc1new');
  });

  it.each(['isExternal', 'isHardware', 'isInjected', 'isMobile'])(
    'does not derive a new root for a %s account', async (flag) => {
      const pair = fixture({ [flag]: true });
      expect(needsLegacyNetworkEnrollment(pair)).toBe(false);
      await enroll(pair);
      expect(mocks.decode).not.toHaveBeenCalled();
    }
  );

  it.each(['ton-native', 'bitcoin', 'cardano'])('does not reinterpret %s keys as BIP39', async (type) => {
    await enroll(fixture({}, type));
    expect(mocks.decode).not.toHaveBeenCalled();
  });

  it('leaves raw-secret and not-yet-migrated accounts intact', async () => {
    mocks.decode.mockReturnValue('');
    await enroll(fixture());
    expect(mocks.writes).not.toHaveBeenCalled();
    mocks.decode.mockClear();
    await enroll(fixture({ isMasterPassword: false }));
    expect(mocks.decode).not.toHaveBeenCalled();
  });

  it('does not recreate an account deleted while deriving', async () => {
    const pair = fixture();
    await enrollLegacyAccountNetworks(pair, 'fixture-password', () => true, async () => {
      mocks.current = undefined; mocks.record = undefined;
    });
    expect(mocks.writes).not.toHaveBeenCalled();
    expect(mocks.record).toBeUndefined();
  });

  it('abandons results after lock and rejects an encrypted snapshot changed during derivation', async () => {
    const pair = fixture();
    let unlocked = true;
    await enrollLegacyAccountNetworks(pair, 'fixture-password', () => unlocked, async () => { unlocked = false; });
    expect(mocks.writes).not.toHaveBeenCalled();
    await enrollLegacyAccountNetworks(pair, 'fixture-password', () => true, async () => {
      mocks.record!.encoded = 'password-was-changed';
    });
    expect(mocks.writes).not.toHaveBeenCalled();
  });

  it('merges concurrent rename metadata and publishes only after commit', async () => {
    const pair = fixture();
    mocks.record!.meta.name = 'Renamed in storage';
    let finish!: () => void;
    mocks.beforeCommit.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const pending = updateAccountMetadata(pair, (meta) => ({ ...meta, bitcoinAddress: 'bc1new' }));
    expect(pair.meta.name).toBe('Original');
    expect(mocks.published).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(pair.meta).toMatchObject({ name: 'Renamed in storage', bitcoinAddress: 'bc1new' });
    expect(mocks.record?.encoded).toBe('original-ciphertext');
  });
});
