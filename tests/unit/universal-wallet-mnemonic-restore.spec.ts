import { shallowMount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { Keyring } from '@subwallet/keyring';
import { cryptoWaitReady, encodeAddress } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import type { Wallet } from '@/stores';
import type { FWKeyringMeta } from '@/extension/background/extension-base/src/types';
import AddWallet from '@/screens/addWallet/AddWallet.vue';
import { addAccount } from '@/extension/messaging';
import { WalletEcosystem } from '@/interfaces';
import { withUniversalWalletKeyringMeta } from '@/util/universalWalletKeyringMeta';
import { createUniversalWalletRegistryNetworks } from '@/util/universalWalletRegistryNetworks';
import { getIrohaChainAccounts } from '@/helpers/accounts';
import { useNetworksStore } from '@/stores/networks';

vi.mock('@/extension/messaging', () => ({
  addAccount: vi.fn(), forgetAccount: vi.fn(), isDerivationPathValid: vi.fn(), isJsonValid: vi.fn(),
  jsonRestore: vi.fn(), windowOpen: vi.fn(), updatePairMeta: vi.fn(), generateMnemonic: vi.fn(),
  mnemonicValidate: vi.fn(), getHistory: vi.fn(), toggleFavoriteNetwork: vi.fn(),
}));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));
vi.mock('@/router/routes', () => ({ Components: {} }));
// CJS TON dependencies and transformed keyring modules must share one Buffer
// implementation in the Node test runner (the browser bundles both together).
vi.mock('vite-plugin-node-polyfills/shims/buffer', async () => {
  const { createRequire } = await import('node:module');
  const { Buffer } = createRequire(import.meta.url)('node:buffer');
  return { default: Buffer, Buffer };
});

describe('mnemonic restore across the import form and public account inventory', () => {
  beforeAll(async () => { await cryptoWaitReady(); });

  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('restore must work offline'); }));
    setActivePinia(createPinia());
    useNetworksStore().allNetworks = createUniversalWalletRegistryNetworks();
    vi.mocked(addAccount).mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each(vectors.vectors)('restores $id into fresh keyrings with every reference address', async (vector) => {
    const expected = vector.expected;
    // No expected public keys are injected. Only the extension transport/storage
    // boundary is replaced; the import form, keyring crypto, and metadata are real.
    for (const name of ['Original wallet', 'Restored on another installation']) {
      const keyring = new Keyring();
      vi.mocked(addAccount).mockImplementation(async (suri, type, meta, ecosystem = WalletEcosystem.Substrate) => {
        const pair = keyring.addFromUri(suri, { ...meta }, type);
        pair.setMeta(withUniversalWalletKeyringMeta(pair.address, meta, ecosystem));
        return pair.address;
      });
      const wrapper = shallowMount(AddWallet, {
        global: {
          mocks: { $t: (key: string) => key, $route: { params: { type: 'import', walletEcosystem: 'substrate' } } },
          stubs: { FButton: true, Icon: true },
        },
      });
      await wrapper.setData({ mnemonic: vector.mnemonic, nickname: name });
      const address = await wrapper.vm.saveKeypairFromSeed();
      const root = keyring.getPair(address);
      const meta = root.meta as FWKeyringMeta;
      expect(root.type).toBe('sr25519');
      expect(u8aToHex(root.publicKey).slice(2)).toBe(expected.substrate.publicKeyHex);
      expect(encodeAddress(root.publicKey, expected.substrate.ss58Prefix)).toBe(expected.substrate.polkadotAddress);
      expect(meta.ethereumAddress).toBe(expected.evm.address);
      expect(keyring.getPairs()).toHaveLength(2);
      expect(meta.universalWallet?.publicAccounts.map(({ accountId, address }) => [accountId, address])).toEqual([
        ['substrate-default', root.address],
        ['evm-default', expected.evm.address],
        ['bitcoin-mainnet', expected.bitcoin.mainnet.firstReceiveAddress],
        ['bitcoin-testnet', expected.bitcoin.testnet.firstReceiveAddress],
        ['solana-mainnet', expected.solana.address],
        ['ton-mainnet', expected.ton.addressNonBounceable],
        ['iroha-taira', expected.iroha.taira.i105],
        ['iroha-nexus', expected.iroha.nexus.i105],
      ]);
      expect(meta.irohaPublicKeyHex).toBe(expected.iroha.taira.publicKeyHex);
      const wallet = { ...meta, address, isSubstrate: true, isTon: false, hasEthereum: true } as Wallet;
      expect(getIrohaChainAccounts(useNetworksStore().allNetworks, wallet).map(({ address }) => address))
        .toEqual([expected.iroha.taira.i105, expected.iroha.nexus.i105]);
      const iroha = meta.universalWallet!.publicAccounts.filter(({ ecosystem }) => ecosystem === WalletEcosystem.Iroha);
      expect(iroha[0].publicKeyHex).toBe(iroha[1].publicKeyHex);
      expect(iroha[0].address).not.toBe(iroha[1].address);
      expect(fetch).not.toHaveBeenCalled();
      wrapper.unmount();
    }
  });
});
