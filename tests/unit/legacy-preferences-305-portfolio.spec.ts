import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, nextTick } from 'vue';
import { APIItemState } from '@extension-base/api/types/networks';
import { getMockAssets } from '@extension-base/background/helpers/assets';
import { getMockAssets as getMockAssets305 } from '../fixtures/legacy-305/getMockAssets.305';
import {
  EVM_ADDRESS,
  SECOND_SUBSTRATE_ADDRESS,
  SUBSTRATE_ADDRESS,
  TON_ADDRESS,
  groupOf,
  networkMap305,
  readLegacy305Fixture,
  readSnapshot,
  type Legacy305FixtureName,
} from '../fixtures/legacy-305/generate';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { AccountJson, TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { createAssetKey } from '@/portfolio/assetIdentity';
import { usePortfolioPreferences } from '@/portfolio/usePortfolioPreferences';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/router/routes', () => ({ Components: { AssetHistory: 'AssetHistory' } }));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, tc: (key: string) => key }) }));
vi.mock('@/extension/messaging', () => ({ getHistory: vi.fn(), toggleFavoriteNetwork: vi.fn(), sendMessage: vi.fn() }));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));
vi.mock('@/extension/messaging/asset-discovery', () => ({ forceAssetDiscoverySweep: vi.fn() }));
vi.mock('@/extension/messaging/nfts', () => ({ fetchNfts: vi.fn() }));
vi.mock('@/stores/extension', () => ({
  useExtensionStore: () => ({ features: { assetDiscoveryMode: 'visible' } }),
}));

import Currencies from '@/screens/wallet&asset/wallet/Currencies.vue';

const createLocalStorageStub = () => {
  const storage = new Map<string, string>();

  return {
    clear: vi.fn(() => storage.clear()),
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(storage.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => storage.delete(key)),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    get length() {
      return storage.size;
    },
  };
};

type LocalStorageStub = ReturnType<typeof createLocalStorageStub>;

const LEGACY_KEYS = ['account_hidden-assets', 'account_sequence-assets', 'account_custom-sort'];

const snapshot = readSnapshot();
const networkMap = networkMap305(snapshot);
const productionNetworks = Object.values(networkMap).map((network) => ({ ...network, favorite: [] })) as NetworkJson[];
const tonNetwork = productionNetworks.find(({ ecosystem }) => ecosystem === 'ton')!;

let storage: LocalStorageStub;

function seed(name: Legacy305FixtureName): Record<string, string> {
  const { localStorage: entries } = readLegacy305Fixture(name);
  Object.entries(entries).forEach(([key, value]) => storage.setItem(key, value));
  storage.setItem.mockClear();
  return entries;
}

function expectLegacyKeysUntouched(entries: Record<string, string>) {
  LEGACY_KEYS.forEach((key) => expect(storage.getItem(key), key).toBe(entries[key] ?? null));
  [...storage.setItem.mock.calls, ...storage.removeItem.mock.calls].forEach(([key]) =>
    expect(LEGACY_KEYS).not.toContain(key)
  );
}

const wallet = (address: string, walletEcosystem = WalletEcosystem.Substrate) =>
  ({
    address,
    ethereumAddress: walletEcosystem === WalletEcosystem.Ton ? '' : '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
    name: address.slice(0, 6),
    walletEcosystem,
  }) as AccountJson;

/** Registry keys of one symbol on the networks whose relay chain 3.0.5 grouped it under. */
function registryKeys(symbol: string, networkNames: string[]): string[] {
  return productionNetworks
    .filter(({ name }) => networkNames.includes(name))
    .flatMap((network) =>
      network.assets
        .filter((asset) => asset.symbol === symbol)
        .map((asset) =>
          createAssetKey({
            ecosystem: String(network.ecosystem),
            chainId: network.chainId,
            assetId: String(asset.currencyId ?? asset.id),
          })
        )
    );
}

/** The keys of every member of one 3.0.5 group, taken from the 3.0.5 grouping code itself. */
function legacyGroupKeys(symbol: string, relayChain: string): string[] {
  const keyOf = (balance: BalanceItem) => {
    const network = productionNetworks.find(({ name }) => name.toLowerCase() === balance.name)!;

    return createAssetKey({
      ecosystem: String(network.ecosystem),
      chainId: network.chainId,
      assetId: String(balance.currencyId ?? balance.id),
    });
  };

  return groupOf(getMockAssets305(networkMap, WalletEcosystem.Substrate), symbol, relayChain).balances.map(keyOf);
}

/** What a develop build's one-shot v1 migration hid: only the rows whose own registry id was a stored group id. */
function developV1MigratedKeys(legacyHiddenIds: string[]): string[] {
  return productionNetworks.flatMap((network) =>
    network.assets
      .filter((asset) => legacyHiddenIds.includes(asset.id))
      .map((asset) =>
        createAssetKey({
          ecosystem: String(network.ecosystem),
          chainId: network.chainId,
          assetId: String(asset.currencyId ?? asset.id),
        })
      )
  );
}

const KUSAMA_KSM_NETWORKS = [
  'Kusama',
  'Kusama AssetHub',
  'Karura',
  'Shiden',
  'Bifrost',
  'Calamari',
  'Parallel Heiko',
  'Basilisk',
  'Kintsugi',
  'Robonomics',
  'Turing Network',
  'Encointer on Kusama',
  'Amplitude',
  'Kusama BridgeHub',
  'Kusama People',
];

function fundedSubstrateBalances(): TokenGroup[] {
  const groups = getMockAssets(networkMap, WalletEcosystem.Substrate);
  const fund = (networkName: string, symbol: string, amount: string) =>
    groups
      .flatMap(({ balances }) => balances)
      .filter((balance) => balance.name === networkName.toLowerCase() && balance.symbol === symbol)
      .forEach((balance) => Object.assign(balance, { state: APIItemState.READY, total: amount, transferable: amount }));

  fund('Kusama', 'ksm', '3');
  fund('Kusama AssetHub', 'ksm', '1');
  fund('Polkadot', 'dot', '12.5');
  fund('Ethereum', 'eth', '0.75');
  fund('Ethereum', 'usdt', '40');
  fund('Polygon', 'usdt', '2');

  return groups;
}

const jettonGroup = (name: string, symbol: string, master: string): TokenGroup =>
  ({
    icon: '',
    groupId: master,
    mainNetwork: tonNetwork.name,
    providers: [],
    symbol,
    tokenName: name,
    relayChain: tonNetwork.name.toLowerCase(),
    balances: [
      {
        assetMetadataSource: 'indexer',
        assetMetadataTrust: 'unverified',
        icon: tonNetwork.icon,
        id: master,
        name: tonNetwork.name,
        precision: 9,
        state: APIItemState.READY,
        symbol,
        total: '1',
        transferable: '1',
        type: 'jetton',
      },
    ],
  }) as TokenGroup;

const tonKey = (assetId: string) => createAssetKey({ ecosystem: 'ton', chainId: tonNetwork.chainId, assetId });

describe('portfolio preferences derived from 3.0.5', () => {
  beforeEach(() => {
    storage = createLocalStorageStub();
    vi.stubGlobal('localStorage', storage);
    setActivePinia(createPinia());
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('applies a 3.0.5 group hide to every member and lets an explicit choice override it', async () => {
    const entries = seed('switches');
    const accountsStore = useAccountsStore();
    useNetworksStore().allNetworks = productionNetworks;
    accountsStore.setSelectedWallet(wallet(SUBSTRATE_ADDRESS));

    const scope = effectScope();
    const preferences = scope.run(() => usePortfolioPreferences())!;
    const ksmKeys = registryKeys('ksm', KUSAMA_KSM_NETWORKS);
    const usdtEthereumKeys = registryKeys('usdt', ['Ethereum', 'Polygon', 'Arbitrum One', 'OP Mainnet']);
    const dotKeys = registryKeys('dot', ['Polkadot', 'Polkadot AssetHub', 'Acala', 'Hydration']);

    expect(ksmKeys).toHaveLength(15);
    [...ksmKeys, ...usdtEthereumKeys].forEach((key) => {
      expect(preferences.effectivePreferences.value[key], key).toBe('hidden');
      expect(preferences.preferenceSource(key)).toBe('legacy305');
      expect(preferences.hiddenKeys.value.has(key)).toBe(true);
    });
    dotKeys.forEach((key) => expect(preferences.effectivePreferences.value[key]).toBeUndefined());
    expect(preferences.legacyOrderIndex.value.size).toBe(0);

    accountsStore.setAssetPreference({ key: ksmKeys[0], preference: 'auto' });
    expect(preferences.effectivePreferences.value[ksmKeys[0]]).toBe('auto');
    expect(preferences.preferenceSource(ksmKeys[0])).toBe('explicit');
    expect(preferences.effectivePreferences.value[ksmKeys[1]]).toBe('hidden');

    accountsStore.setSelectedWallet(wallet(SECOND_SUBSTRATE_ADDRESS));
    await nextTick();
    ksmKeys.forEach((key) => expect(preferences.effectivePreferences.value[key]).toBeUndefined());
    dotKeys.forEach((key) => expect(preferences.effectivePreferences.value[key]).toBe('hidden'));

    scope.stop();
    expectLegacyKeysUntouched(entries);
  });

  it('hides jettons that load after the portfolio opened and orders them by the 3.0.5 sequence', () => {
    const entries = seed('ton');
    const accountsStore = useAccountsStore();
    useNetworksStore().allNetworks = productionNetworks;
    accountsStore.setSelectedWallet(wallet(TON_ADDRESS, WalletEcosystem.Ton));
    accountsStore.setBalance({ details: getMockAssets(networkMap, WalletEcosystem.Ton) });

    const scope = effectScope();
    const preferences = scope.run(() => usePortfolioPreferences())!;
    const [{ id: tonId }] = tonNetwork.assets;

    expect(preferences.hiddenKeys.value.size).toBe(0);
    expect(Object.fromEntries(preferences.legacyOrderIndex.value)).toEqual({ [tonKey(tonId)]: 2 });

    accountsStore.setBalance({
      details: [
        ...(accountsStore.balances as unknown as TokenGroup[]),
        jettonGroup('Tether USD', 'usdt', 'EQ_RealTether'),
        jettonGroup('Notcoin', 'not', 'EQ_Notcoin'),
        jettonGroup('Dogs', 'dogs', 'EQ_Dogs'),
      ],
    });

    expect([...preferences.hiddenKeys.value].sort()).toEqual([tonKey('EQ_Notcoin'), tonKey('EQ_RealTether')].sort());
    expect(Object.fromEntries(preferences.legacyOrderIndex.value)).toEqual({
      [tonKey('EQ_Dogs')]: 0,
      [tonKey('EQ_RealTether')]: 1,
      [tonKey(tonId)]: 2,
      [tonKey('EQ_Notcoin')]: 3,
    });

    scope.stop();
    expectLegacyKeysUntouched(entries);
  });

  it('applies hides 3.0.5 stored under an 0x wallet address to every member of the hidden groups', () => {
    const entries = seed('evm-standalone');
    const accountsStore = useAccountsStore();
    useNetworksStore().allNetworks = productionNetworks;
    accountsStore.setSelectedWallet({
      address: EVM_ADDRESS,
      ethereumAddress: EVM_ADDRESS,
      name: 'EVM',
      walletEcosystem: WalletEcosystem.Evm,
    } as AccountJson);

    const scope = effectScope();
    const preferences = scope.run(() => usePortfolioPreferences())!;
    const ethKeys = legacyGroupKeys('eth', 'ethereum');
    const usdcKeys = legacyGroupKeys('usdc', 'ethereum');

    expect(ethKeys.length).toBeGreaterThan(1);
    expect(usdcKeys.length).toBeGreaterThan(1);
    expect([...preferences.hiddenKeys.value].sort()).toEqual([...new Set([...ethKeys, ...usdcKeys])].sort());
    [...ethKeys, ...usdcKeys].forEach((key) => expect(preferences.preferenceSource(key)).toBe('legacy305'));

    scope.stop();
    expectLegacyKeysUntouched(entries);
  });

  it('keeps hides a develop build migrated into v1 and still hides the rest of their 3.0.5 groups', () => {
    const entries = seed('switches');
    const legacyHiddenIds = JSON.parse(entries['account_hidden-assets']).value[SUBSTRATE_ADDRESS] as string[];
    const migratedKeys = developV1MigratedKeys(legacyHiddenIds);
    // The develop build's one-shot migration left these behind; they are read as explicit hides and never rewritten.
    const developV1 = JSON.stringify({
      value: { [SUBSTRATE_ADDRESS]: Object.fromEntries(migratedKeys.map((key) => [key, 'hidden'])) },
    });
    const developMigrated = JSON.stringify({ value: { [SUBSTRATE_ADDRESS]: true } });
    storage.setItem('account_asset-preferences-v1', developV1);
    storage.setItem('account_asset-preferences-v1-migrated', developMigrated);
    storage.setItem.mockClear();

    const accountsStore = useAccountsStore();
    useNetworksStore().allNetworks = productionNetworks;
    accountsStore.setSelectedWallet(wallet(SUBSTRATE_ADDRESS));

    const scope = effectScope();
    const preferences = scope.run(() => usePortfolioPreferences())!;
    const groupKeys = [...legacyGroupKeys('ksm', 'Kusama'), ...legacyGroupKeys('usdt', 'ethereum')];

    // v1 reached one row per group; the rebuild covers the whole group.
    expect(migratedKeys).toHaveLength(2);
    expect(groupKeys.length).toBeGreaterThan(20);
    groupKeys.forEach((key) => {
      expect(preferences.effectivePreferences.value[key], key).toBe('hidden');
      expect(preferences.preferenceSource(key), key).toBe(migratedKeys.includes(key) ? 'explicit' : 'legacy305');
    });

    scope.stop();
    expect(storage.getItem('account_asset-preferences-v1')).toBe(developV1);
    expect(storage.getItem('account_asset-preferences-v1-migrated')).toBe(developMigrated);
    expect(storage.setItem).not.toHaveBeenCalled();
    expectLegacyKeysUntouched(entries);
  });

  it('applies 3.0.5 hides once the network list arrives, including to networks added since 3.0.5', () => {
    const entries = seed('switches');
    const accountsStore = useAccountsStore();
    const networksStore = useNetworksStore();
    accountsStore.setSelectedWallet(wallet(SUBSTRATE_ADDRESS));

    const scope = effectScope();
    const preferences = scope.run(() => usePortfolioPreferences())!;

    // The popup can open before the registry loads: nothing maps yet, and the stored ids are not reported as gone.
    expect(preferences.hiddenKeys.value.size).toBe(0);

    networksStore.allNetworks = productionNetworks;
    const ksmKeys = legacyGroupKeys('ksm', 'Kusama');
    ksmKeys.forEach((key) => expect(preferences.hiddenKeys.value.has(key), key).toBe(true));

    // A parachain added to the registry after 3.0.5 joins the KSM group exactly as 3.0.5 would have put it there.
    const kusama = productionNetworks.find(({ name }) => name === 'Kusama')!;
    const polkadot = productionNetworks.find(({ name }) => name === 'Polkadot')!;
    const newParachain = (name: string, chainId: string, parentId: string): NetworkJson => ({
      ...kusama,
      name,
      chainId,
      parentId,
      favorite: [],
      assets: [{ ...kusama.assets[0], id: `${chainId}-ksm`, currencyId: undefined, isNative: undefined, isUtility: undefined }],
    });
    const newKey = (chainId: string) => createAssetKey({ ecosystem: 'substrate', chainId, assetId: `${chainId}-ksm` });
    networksStore.allNetworks = [
      ...productionNetworks,
      newParachain('Kusama Newcomer', '0xkusama-newcomer', kusama.chainId),
      newParachain('Polkadot Newcomer', '0xpolkadot-newcomer', polkadot.chainId),
    ];

    expect(preferences.effectivePreferences.value[newKey('0xkusama-newcomer')]).toBe('hidden');
    expect(preferences.preferenceSource(newKey('0xkusama-newcomer'))).toBe('legacy305');
    // KSM under the Polkadot relay chain was never part of the Kusama group.
    expect(preferences.effectivePreferences.value[newKey('0xpolkadot-newcomer')]).toBeUndefined();
    ksmKeys.forEach((key) => expect(preferences.hiddenKeys.value.has(key), key).toBe(true));
    expect(console.info).not.toHaveBeenCalled();

    scope.stop();
    expectLegacyKeysUntouched(entries);
  });

  it('renders the portfolio with legacy hides, and switches plus a wallet change never write the 3.0.5 keys', async () => {
    const entries = seed('switches');
    const accountsStore = useAccountsStore();
    useNetworksStore().allNetworks = productionNetworks;
    accountsStore.setSelectedWallet(wallet(SUBSTRATE_ADDRESS));
    accountsStore.setBalance({ details: fundedSubstrateBalances() });
    accountsStore.setIsBalanceLoading(false);

    const wrapper = mount(Currencies, {
      props: { balances: [], filterValue: '', showAssetsManagementForm: true },
      global: {
        mocks: { $t: (key: string) => key },
        stubs: {
          ExternalLogo: true,
          Icon: true,
          Loader: true,
          Scroll: { template: '<main><slot /></main>' },
          Switcher: {
            props: ['value'],
            emits: ['change'],
            template: '<button type="button" class="switcher-stub" @click="$emit(\'change\', !value)" />',
          },
        },
      },
    });
    // Funded networks render; Manage marks hidden rows instead of dropping them, so each hide can be undone.
    const rows = () =>
      wrapper
        .findAll('.network-section')
        .flatMap((section) =>
          section
            .findAll('.asset-row')
            .map(
              (row) =>
                `${section.attributes('data-network')}:${row.get('.asset-symbol').text()}` +
                (row.find('[data-testid="hiddenPreviousVersion"]').exists() ? ':hidden-305' : '') +
                (row.find('[data-testid="hiddenBadge"]').exists() ? ':hidden' : '')
            )
        );

    expect(rows()).toEqual(expect.arrayContaining(['Polkadot:DOT', 'Ethereum:ETH']));
    expect(rows()).toEqual(
      expect.arrayContaining(['Kusama:KSM:hidden-305:hidden', 'Ethereum:USDT:hidden-305:hidden', 'Polygon:USDT:hidden-305:hidden'])
    );
    expect(rows().filter((row) => (row.includes(':KSM') || /^(Ethereum|Polygon):USDT/.test(row)) && !row.endsWith(':hidden')))
      .toEqual([]);

    await wrapper.setProps({ showAssetsManagementForm: false });
    expect(rows().filter((row) => row.includes(':KSM') || /^(Ethereum|Polygon):USDT/.test(row))).toEqual([]);
    await wrapper.setProps({ showAssetsManagementForm: true });

    const switches = wrapper.findAll('.switcher-stub');
    expect(switches.length).toBeGreaterThanOrEqual(3);
    for (const toggle of switches.slice(0, 3)) await toggle.trigger('click');
    expect(Object.keys(accountsStore.assetPreferences)).toHaveLength(3);

    accountsStore.setSelectedWallet(wallet(SECOND_SUBSTRATE_ADDRESS));
    accountsStore.setIsBalanceLoading(false);
    await nextTick();

    expect(rows()).toEqual(expect.arrayContaining(['Kusama:KSM', 'Ethereum:USDT', 'Polkadot:DOT:hidden-305:hidden']));
    expect(rows()).not.toContain('Polkadot:DOT');

    wrapper.unmount();
    expectLegacyKeysUntouched(entries);
    expect(storage.getItem('account_asset-preferences-v1')).not.toBeNull();
  });
});

describe('accounts store writes', () => {
  beforeEach(() => {
    storage = createLocalStorageStub();
    vi.stubGlobal('localStorage', storage);
    setActivePinia(createPinia());
  });

  it('batches explicit preferences into the v1 key and leaves the 3.0.5 keys alone', () => {
    const entries = seed('hide-zero');
    const accountsStore = useAccountsStore();
    accountsStore.setSelectedWallet(wallet(SUBSTRATE_ADDRESS));

    accountsStore.setAssetPreferences({
      entries: [
        { key: 'substrate:a:1', preference: 'shown' },
        { key: 'substrate:a:2', preference: 'hidden' },
      ],
    });
    accountsStore.setAssetPreferences({ entries: [] });
    // A stale caller still passing the 3.0.5 flag no longer saves a sequence.
    accountsStore.setBalance({ details: [], saveSequence: true } as never);

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.getItem('account_asset-preferences-v1')!)).toEqual({
      value: { [SUBSTRATE_ADDRESS]: { 'substrate:a:1': 'shown', 'substrate:a:2': 'hidden' } },
    });
    expectLegacyKeysUntouched(entries);
  });

  it('opens with corrupt 3.0.5 and v1 values instead of failing to create the store', () => {
    LEGACY_KEYS.forEach((key) => storage.setItem(key, '{not json'));
    storage.setItem('account_asset-preferences-v1', '{"value":{"addr":{"k":"hidden","bad":"nope"},"x":3}}');

    const accountsStore = useAccountsStore();
    accountsStore.setSelectedWallet(wallet('addr'));

    expect(accountsStore.hiddenAssetsForAllAccounts).toEqual({});
    expect(accountsStore.isCustomSort('addr')).toBe(false);
    expect(accountsStore.assetPreferences).toEqual({ k: 'hidden' });
    LEGACY_KEYS.forEach((key) => expect(storage.getItem(key)).toBe('{not json'));
  });
});
