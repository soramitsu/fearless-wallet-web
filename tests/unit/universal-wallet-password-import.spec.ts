import { shallowMount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { Keyring } from '@subwallet/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import passphraseVectors from '../../docs/universal-wallet-v2-passphrase-vectors.json';
import type { FWKeyringMeta } from '@/extension/background/extension-base/src/types';
import type { UniversalWalletPasswordDiscoveryItem } from '@extension-base/background/types/types';
import AddWallet from '@/screens/addWallet/AddWallet.vue';
import { addAccount, universalWalletPasswordDiscovery } from '@/extension/messaging';
import { WalletEcosystem } from '@/interfaces';
import { withUniversalWalletKeyringMeta } from '@/util/universalWalletKeyringMeta';
import { createUniversalWalletRegistryNetworks } from '@/util/universalWalletRegistryNetworks';
import { useNetworksStore } from '@/stores/networks';

vi.mock('@/extension/messaging', () => ({
  addAccount: vi.fn(), forgetAccount: vi.fn(), isDerivationPathValid: vi.fn(), isJsonValid: vi.fn(),
  jsonRestore: vi.fn(), windowOpen: vi.fn(), updatePairMeta: vi.fn(), generateMnemonic: vi.fn(),
  mnemonicValidate: vi.fn(), getHistory: vi.fn(), toggleFavoriteNetwork: vi.fn(), tonImportCandidates: vi.fn(),
  universalWalletPasswordDiscovery: vi.fn(),
}));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));
vi.mock('@/router/routes', () => ({ Components: {} }));
vi.mock('vite-plugin-node-polyfills/shims/buffer', async () => {
  const { createRequire } = await import('node:module');
  const { Buffer } = createRequire(import.meta.url)('node:buffer');
  return { default: Buffer, Buffer };
});

const [import12] = vectors.vectors;
const [trezor] = passphraseVectors.vectors;
const legacy = import12.expected;
const protectedAccounts = trezor.expected;
const PATH = '//polkadot///TREZOR';

type SavedWallet = { meta: FWKeyringMeta; publicKeyHex: string; ethereumAddress: string };

async function saveWallet(type: 'create' | 'import', substratePath: string): Promise<SavedWallet> {
  const keyring = new Keyring();
  vi.mocked(addAccount).mockImplementation(async (suri, keypairType, meta, ecosystem = WalletEcosystem.Substrate) => {
    const pair = keyring.addFromUri(suri, { ...meta }, keypairType);
    pair.setMeta(withUniversalWalletKeyringMeta(pair.address, meta, ecosystem));
    return pair.address;
  });
  const wrapper = shallowMount(AddWallet, {
    global: {
      mocks: { $t: (key: string) => key, $route: { params: { type, walletEcosystem: 'substrate' } } },
      stubs: { FButton: true, Icon: true },
    },
  });
  await wrapper.setData({
    mnemonic: import12.mnemonic,
    nickname: 'Password wallet',
    derivationPaths: {
      substrate: { value: substratePath, keypairType: 'sr25519' },
      ethereum: { value: '', keypairType: 'ethereum' },
    },
  });
  const address = await wrapper.vm.saveKeypairFromSeed();
  const root = keyring.getPair(address);
  wrapper.unmount();

  return {
    meta: root.meta as FWKeyringMeta,
    publicKeyHex: u8aToHex(root.publicKey).slice(2),
    ethereumAddress: (root.meta as FWKeyringMeta).ethereumAddress ?? '',
  };
}

const discovery = (funds: Partial<Record<UniversalWalletPasswordDiscoveryItem['network'], UniversalWalletPasswordDiscoveryItem['funds']>>) =>
  (['bitcoin', 'bitcoinTestnet', 'solana', 'ton', 'iroha'] as const).map((network) => ({
    network,
    address: `legacy-${network}`,
    funds: funds[network] ?? 'empty',
  }));

describe('Universal Wallet accounts of a wallet with a ///password', () => {
  beforeAll(async () => { await cryptoWaitReady(); });

  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('no network in this test'); }));
    setActivePinia(createPinia());
    useNetworksStore().allNetworks = createUniversalWalletRegistryNetworks();
    vi.mocked(addAccount).mockReset();
    vi.mocked(universalWalletPasswordDiscovery).mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('protects every account of a newly created wallet without asking the network', async () => {
    const { meta } = await saveWallet('create', PATH);

    expect(universalWalletPasswordDiscovery).not.toHaveBeenCalled();
    // Fresh words: no old address ever existed, so nothing is watched.
    expect(meta.universalWalletWatchedNetworks).toBeUndefined();
    expect(meta.bitcoinAddress).toBe(protectedAccounts.bitcoin.mainnet.firstReceiveAddress);
    expect(meta.bitcoinTestnetAddress).toBe(protectedAccounts.bitcoin.testnet.firstReceiveAddress);
    expect(meta.solanaAddress).toBe(protectedAccounts.solana.address);
    expect(meta.tonPublicKeyHex).toBe(protectedAccounts.ton.publicKeyHex);
    expect(meta.irohaAddress).toBe(protectedAccounts.iroha.taira.i105);
    expect(meta.universalWalletLegacyNetworks).toBeUndefined();
    expect(meta.universalWallet?.publicAccounts.find(({ accountId }) => accountId === 'solana-mainnet')?.address)
      .toBe(protectedAccounts.solana.address);
  });

  it('keeps funded and unchecked no-password addresses of an import and protects the empty ones', async () => {
    vi.mocked(universalWalletPasswordDiscovery).mockResolvedValue(discovery({ bitcoin: 'funded', ton: 'unknown' }));

    const { meta, publicKeyHex, ethereumAddress } = await saveWallet('import', PATH);

    expect(universalWalletPasswordDiscovery).toHaveBeenCalledWith(import12.mnemonic);
    expect(meta.universalWalletLegacyNetworks).toEqual(['bitcoin', 'ton']);
    // The empty old addresses stay watched in case funds reach them later.
    expect(meta.universalWalletWatchedNetworks).toEqual(['bitcoinTestnet', 'solana', 'iroha']);
    expect(meta.bitcoinAddress).toBe(legacy.bitcoin.mainnet.firstReceiveAddress);
    expect(meta.tonPublicKeyHex).toBe(legacy.ton.publicKeyHex);
    expect(meta.bitcoinTestnetAddress).toBe(protectedAccounts.bitcoin.testnet.firstReceiveAddress);
    expect(meta.solanaAddress).toBe(protectedAccounts.solana.address);
    expect(meta.irohaPublicKeyHex).toBe(protectedAccounts.iroha.taira.publicKeyHex);
    // The password still reaches the Substrate key; the Ethereum path had none, so EVM is unchanged.
    expect(publicKeyHex).not.toBe(legacy.substrate.publicKeyHex);
    expect(ethereumAddress).toBe(legacy.evm.address);
  });

  it('keeps every no-password address when the network cannot be asked', async () => {
    vi.mocked(universalWalletPasswordDiscovery).mockRejectedValue(new Error('offline'));

    const { meta } = await saveWallet('import', PATH);

    expect(meta.universalWalletLegacyNetworks).toEqual(['bitcoin', 'bitcoinTestnet', 'solana', 'ton', 'iroha']);
    expect(meta.bitcoinAddress).toBe(legacy.bitcoin.mainnet.firstReceiveAddress);
    expect(meta.solanaAddress).toBe(legacy.solana.address);
    expect(meta.irohaAddress).toBe(legacy.iroha.taira.i105);
  });

  it('changes nothing for a wallet whose path has no password', async () => {
    const { meta } = await saveWallet('import', '//polkadot');

    expect(universalWalletPasswordDiscovery).not.toHaveBeenCalled();
    expect(meta.universalWalletLegacyNetworks).toBeUndefined();
    expect(meta.bitcoinAddress).toBe(legacy.bitcoin.mainnet.firstReceiveAddress);
    expect(meta.solanaAddress).toBe(legacy.solana.address);
    expect(meta.tonPublicKeyHex).toBe(legacy.ton.publicKeyHex);
  });
});
