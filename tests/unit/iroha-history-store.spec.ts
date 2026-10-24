import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import type { TokenGroup } from '@extension-base/background/types/types';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';
import { fetchHistory } from '@/history/fetchingHistory';
import { WalletEcosystem } from '@/interfaces';
import { createUniversalWalletRegistryNetworks } from '@/util/universalWalletRegistryNetworks';
import { UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';

vi.mock('@/extension/messaging', () => ({ getHistory: vi.fn(), toggleFavoriteNetwork: vi.fn() }));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));
vi.mock('@/history/fetchingHistory', () => ({ fetchHistory: vi.fn(async () => undefined) }));

const { vectors } = JSON.parse(readFileSync(resolve(__dirname, '../../docs/universal-wallet-v2-vectors.json'), 'utf8'));
const addresses = vectors[0].expected.iroha;

describe('Iroha history account selection', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
    setActivePinia(createPinia());
    vi.mocked(fetchHistory).mockClear();
    useNetworksStore().allNetworks = createUniversalWalletRegistryNetworks();
    useAccountsStore().selectedWallet = {
      address: '5GrwvaEF5zXb26Fz9rcQpDWSfNNbLDcb1RpsN4Hbh6q7G1j',
      ethereumAddress: '',
      irohaAddress: addresses.taira.i105,
      irohaPublicKeyHex: addresses.taira.publicKeyHex,
      name: 'Universal',
      isSubstrate: true,
      isTon: false,
      hasEthereum: false,
      walletEcosystem: WalletEcosystem.Substrate,
    };
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each(['taira', 'nexus'] as const)('uses the %s address when only the Taira legacy address is stored', async (key) => {
    const profile = UNIVERSAL_WALLET_IROHA_NETWORKS[key];
    const network = useNetworksStore().getNetwork(profile.chainId);
    const assetId = key === 'taira' ? UNIVERSAL_WALLET_IROHA_NETWORKS.taira.nativeAsset.id : 'xor#sora';
    useAccountsStore().balances = [{
      groupId: assetId,
      balances: [{ id: assetId, name: network.name, isNative: true, isUtility: true, precision: 9 }],
    }] as TokenGroup[];

    await useNetworksStore().fetchHistory({ networkName: network.name, assetId });

    expect(fetchHistory).toHaveBeenLastCalledWith(
      profile.toriiBaseUrl, addresses[key].i105, 'iroha', network.name, assetId, true, undefined, profile.chainId
    );
    expect(network.disabled).toBe(key === 'nexus');
  });

  it('preserves an explicit Nexus account address', async () => {
    const network = useNetworksStore().getNetwork(UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.chainId);
    const address = vectors[1].expected.iroha.nexus.i105;
    useAccountsStore().balances = [{
      groupId: 'xor#sora',
      balances: [{ id: 'xor#sora', name: network.name, isNative: true, isUtility: true }],
    }] as TokenGroup[];

    await useNetworksStore().fetchHistory({ networkName: network.name, assetId: 'xor#sora', address });

    expect(vi.mocked(fetchHistory).mock.calls[0][1]).toBe(address);
  });
});
