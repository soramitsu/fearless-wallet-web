import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { env } from 'node:process';
import { APIItemState } from '@extension-base/api/types/networks';
import { getMockAssets } from '@extension-base/background/helpers/assets';
import { getMockAssets as getMockAssets305 } from '../fixtures/legacy-305/getMockAssets.305';
import {
  EVM_ADDRESS,
  LEGACY_305_FIXTURES,
  SECOND_SUBSTRATE_ADDRESS,
  SNAPSHOT_PATH,
  SNAPSHOT_SHA256,
  SUBSTRATE_ADDRESS,
  TON_ADDRESS,
  fixturePath,
  generateLegacy305Fixtures,
  groupOf,
  networkMap305,
  readLegacy305Fixture,
  readSnapshot,
  serializeFixture,
  writeLegacy305Fixtures,
  type Legacy305FixtureName,
} from '../fixtures/legacy-305/generate';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { accountController } from '@/controllers/accountController';
import { WalletEcosystem } from '@/interfaces';
import { buildPortfolioSections, createAssetKey, getCanonicalAssetId } from '@/portfolio/assetIdentity';
import {
  buildLegacy305Groups,
  buildLegacy305JettonGroups,
  mergeAssetPreferences,
  relay305,
  resolveLegacy305Hidden,
  resolveLegacy305Order,
  unmappedLegacy305Ids,
} from '@/portfolio/legacyPreferences305';

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

const LEGACY_KEYS = ['account_hidden-assets', 'account_sequence-assets', 'account_custom-sort'];

const snapshot = readSnapshot();
const productionNetworks = Object.values(networkMap305(snapshot));

function seed(name: Legacy305FixtureName): Record<string, string> {
  const { localStorage: entries } = readLegacy305Fixture(name);
  Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
  return entries;
}

/** The key `buildPortfolioSections` gives a balance today, derived independently of legacyPreferences305. */
function headKey(networks: NetworkJson[], balance: BalanceItem): string {
  const network = networks.find(({ name }) => name.toLowerCase() === balance.name.toLowerCase())!;

  return createAssetKey({
    ecosystem: String(network.ecosystem).toLowerCase(),
    chainId: String(network.chainId || network.name),
    assetId: getCanonicalAssetId(balance),
  });
}

const sorted = (keys: Iterable<string>) => [...keys].sort();

function oracleGroups(networks: NetworkJson[]): TokenGroup[] {
  const networkMap = networkMap305(networks);

  return [
    ...getMockAssets305(networkMap, WalletEcosystem.Substrate),
    ...getMockAssets305(networkMap, WalletEcosystem.Ton),
  ];
}

function shuffled<T>(items: T[], seedValue: number): T[] {
  let state = seedValue;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }

  return copy;
}

const tonNetwork = productionNetworks.find(({ ecosystem }) => ecosystem === 'ton')!;

/** A jetton exactly as today's balance service publishes it: keyed by master address, symbol lowercased. */
const jettonGroup = (name: string, symbol: string, master: string, amount = '1'): TokenGroup =>
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
        mainNetwork: tonNetwork.name,
        name: tonNetwork.name,
        precision: 9,
        state: APIItemState.READY,
        symbol,
        total: amount,
        transferable: amount,
        type: 'jetton',
      },
    ],
  }) as TokenGroup;

const tonKey = (assetId: string) => createAssetKey({ ecosystem: 'ton', chainId: String(tonNetwork.chainId), assetId });

describe('legacy 3.0.5 preference fixtures', () => {
  it('pins the registry snapshot the oracle runs on', () => {
    expect(createHash('sha256').update(readFileSync(SNAPSHOT_PATH)).digest('hex')).toBe(SNAPSHOT_SHA256);
    expect(productionNetworks).toHaveLength(87);
  });

  it('keeps the committed localStorage fixtures equal to the 3.0.5 oracle output', () => {
    // The global `process` is the browser polyfill here; `node:process` carries the real environment.
    if (env.LEGACY_305_WRITE_FIXTURES === '1') writeLegacy305Fixtures();

    const generated = generateLegacy305Fixtures(snapshot);
    LEGACY_305_FIXTURES.forEach((name) =>
      expect(readFileSync(fixturePath(name), 'utf8'), name).toBe(serializeFixture(generated[name]))
    );
  });
});

describe('rebuilding 3.0.5 groups from the registry', () => {
  it('hides every member of a 3.0.5 group whichever member id was stored, for any network order', () => {
    [productionNetworks, ...Array.from({ length: 20 }, (_, index) => shuffled(productionNetworks, index + 1))].forEach(
      (networks) => {
        const registryGroups = buildLegacy305Groups(networks);

        oracleGroups(networks).forEach((group) => {
          const expected = sorted(new Set(group.balances.map((balance) => headKey(networks, balance))));

          group.balances.forEach(({ id }) =>
            expect(
              sorted(resolveLegacy305Hidden({ legacyHiddenIds: [id], registryGroups })),
              `${group.symbol}:${id}`
            ).toEqual(expected)
          );
        });
      }
    );
  });

  it('covers all 174 members of multi-network groups where the one-shot v1 migration covered 48', () => {
    const registryGroups = buildLegacy305Groups(productionNetworks);
    const multiNetworkGroups = oracleGroups(productionNetworks).filter(({ balances }) => balances.length > 1);
    const members = multiNetworkGroups.flatMap((group) => group.balances.map((balance) => ({ group, balance })));

    // v1 hid a row only when the row's own registry id equalled the stored group id.
    const coveredByV1 = members.filter(({ group, balance }) => balance.id === group.groupId);
    const coveredNow = members.filter(({ group, balance }) =>
      resolveLegacy305Hidden({ legacyHiddenIds: [group.groupId], registryGroups }).has(
        headKey(productionNetworks, balance)
      )
    );

    expect(multiNetworkGroups).toHaveLength(48);
    expect(members).toHaveLength(174);
    expect(coveredByV1).toHaveLength(48);
    expect(coveredNow).toHaveLength(174);
  });

  it('gives members the asset keys the portfolio renders', () => {
    const networkMap = networkMap305(snapshot);
    const groups = [
      ...getMockAssets(networkMap, WalletEcosystem.Substrate),
      ...getMockAssets(networkMap, WalletEcosystem.Ton),
    ];
    groups.forEach((group) =>
      group.balances.forEach((balance) =>
        Object.assign(balance, { state: APIItemState.READY, total: '1', transferable: '1' })
      )
    );
    // 3.0.5 loaded the enabled test networks without the `testnet` option too (CAGA Ankara, Avail Turing).
    const rendered = buildPortfolioSections({
      groups,
      networks: productionNetworks,
      prices: {},
      preferences: {},
      addressForNetwork: () => 'wallet',
      showTestnets: true,
    }).flatMap(({ assets }) => assets.map(({ key }) => key));

    expect(sorted(new Set(buildLegacy305Groups(productionNetworks).flatMap(({ keys }) => keys)))).toEqual(
      sorted(new Set(rendered))
    );
  });

  it('derives the relay chain like 3.0.5', () => {
    const byName = (name: string) => productionNetworks.find((network) => network.name === name)!;

    expect(relay305(byName('Kusama AssetHub'), productionNetworks)).toBe('Kusama');
    expect(relay305(byName('Polygon'), productionNetworks)).toBe('ethereum');
    expect(relay305(byName('SORA Mainnet'), productionNetworks)).toBe('SORA Mainnet');
  });

  it('never puts Bitcoin, Solana or Iroha networks into a legacy group', () => {
    const usdtEthereum = groupOf(oracleGroups(productionNetworks), 'usdt', 'ethereum');
    const universal = (['bitcoin', 'solana', 'iroha'] as const).map(
      (ecosystem) =>
        ({
          name: `${ecosystem} network`,
          chainId: `${ecosystem}:mainnet`,
          ecosystem,
          options: ['ethereum'],
          assets: [
            { id: usdtEthereum.groupId, symbol: 'usdt' },
            { id: `${ecosystem}-native`, symbol: 'usdt' },
          ],
        }) as unknown as NetworkJson
    );
    const registryGroups = buildLegacy305Groups([...productionNetworks, ...universal]);
    const hidden = resolveLegacy305Hidden({ legacyHiddenIds: [usdtEthereum.groupId], registryGroups });

    expect(sorted(hidden)).toEqual(
      sorted(new Set(usdtEthereum.balances.map((balance) => headKey(productionNetworks, balance))))
    );
    expect(registryGroups.flatMap(({ keys }) => keys).some((key) => /^(bitcoin|solana|iroha):/.test(key))).toBe(false);
  });

  it('ignores testnet and disabled networks, as 3.0.5 production builds did', () => {
    const ksm = groupOf(oracleGroups(productionNetworks), 'ksm', 'Kusama');
    const testnetCopy = {
      ...productionNetworks.find(({ name }) => name === 'Kusama AssetHub')!,
      name: 'Kusama Testnet Hub',
      chainId: 'kusama-testnet-hub',
      options: ['testnet'],
    } as NetworkJson;
    const disabledCopy = {
      ...testnetCopy,
      name: 'Kusama Disabled Hub',
      chainId: 'kusama-disabled',
      options: [],
      disabled: true,
    };
    const hidden = resolveLegacy305Hidden({
      legacyHiddenIds: [ksm.groupId],
      registryGroups: buildLegacy305Groups([...productionNetworks, testnetCopy, disabledCopy]),
    });

    expect(hidden.size).toBe(15);
    expect([...hidden].some((key) => key.includes('testnet') || key.includes('disabled'))).toBe(false);
  });
});

describe('3.0.5 jetton hides', () => {
  const hiddenIds = () => accountController.getLegacy305Preferences(TON_ADDRESS).hiddenIds;

  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageStub());
    seed('ton');
  });

  it('hides every jetton 3.0.5 merged into a hidden group and nothing else', () => {
    const groups = [
      jettonGroup('Tether USD', 'usdt', 'EQ_RealTether'),
      jettonGroup('Tether', 'usdt', 'EQ_ImpostorTether'),
      jettonGroup('Notcoin', 'not', 'EQ_Notcoin', '0'),
      jettonGroup('Dogs', 'dogs', 'EQ_Dogs'),
    ];
    const hidden = resolveLegacy305Hidden({
      legacyHiddenIds: hiddenIds(),
      registryGroups: buildLegacy305Groups(productionNetworks),
      jettonGroups: buildLegacy305JettonGroups(groups, productionNetworks),
    });

    expect(hiddenIds()).toEqual(['tether usd - usdt', 'notcoin - not']);
    expect(sorted(hidden)).toEqual(
      sorted([tonKey('EQ_RealTether'), tonKey('EQ_ImpostorTether'), tonKey('EQ_Notcoin')])
    );
  });

  it('hides a same-symbol jetton that loads later, because nothing was migrated once', () => {
    const resolve = (groups: TokenGroup[]) =>
      resolveLegacy305Hidden({
        legacyHiddenIds: hiddenIds(),
        registryGroups: buildLegacy305Groups(productionNetworks),
        jettonGroups: buildLegacy305JettonGroups(groups, productionNetworks),
      });
    const early = [jettonGroup('Dogs', 'dogs', 'EQ_Dogs')];

    expect(resolve(early).size).toBe(0);
    expect(sorted(resolve([...early, jettonGroup('Tether USD', 'usdt', 'EQ_RealTether')]))).toEqual([
      tonKey('EQ_RealTether'),
    ]);
  });

  it('keys jetton members exactly as the portfolio renders them', () => {
    const groups = [jettonGroup('Tether USD', 'usdt', 'EQ_RealTether')];
    const [rendered] = buildPortfolioSections({
      groups,
      networks: productionNetworks,
      prices: {},
      preferences: { [tonKey('EQ_RealTether')]: 'shown' },
      addressForNetwork: () => TON_ADDRESS,
    }).flatMap(({ assets }) => assets);

    expect(buildLegacy305JettonGroups(groups, productionNetworks)[0].keys).toEqual([rendered.key]);
  });
});

describe('3.0.5 custom order', () => {
  beforeEach(() => vi.stubGlobal('localStorage', createLocalStorageStub()));

  it('orders every member by its group position after Hide zero saved a sequence', () => {
    seed('hide-zero');
    const { sequence, customSort } = accountController.getLegacy305Preferences(SUBSTRATE_ADDRESS);
    const groups = oracleGroups(productionNetworks);
    const order = resolveLegacy305Order({
      sequence,
      customSort,
      registryGroups: buildLegacy305Groups(productionNetworks),
    });

    expect(customSort).toBe(true);
    expect(sequence.slice(0, 3)).toEqual(
      [groupOf(groups, 'dot', 'Polkadot'), groupOf(groups, 'eth', 'ethereum'), groupOf(groups, 'usdc', 'ethereum')].map(
        ({ groupId }) => groupId
      )
    );

    const expected = new Map<string, number>();
    sequence.forEach((groupId, index) =>
      groups
        .filter((group) => group.groupId === groupId)
        .forEach((group) =>
          group.balances.forEach((balance) => {
            const key = headKey(productionNetworks, balance);
            if (!expected.has(key)) expected.set(key, index);
          })
        )
    );

    const substrateKeys = getMockAssets305(networkMap305(productionNetworks), WalletEcosystem.Substrate).flatMap(
      ({ balances }) => balances.map((balance) => headKey(productionNetworks, balance))
    );

    expect(order).toEqual(expected);
    // Hide zero saved every group of the wallet, so every row has a position.
    expect(order.size).toBe(new Set(substrateKeys).size);
  });

  it('applies no order once another wallet took over custom-sort (the 3.0.5 overwrite)', () => {
    seed('hide-zero');
    localStorage.setItem('account_custom-sort', JSON.stringify({ value: { [SECOND_SUBSTRATE_ADDRESS]: true } }));
    const { sequence, customSort } = accountController.getLegacy305Preferences(SUBSTRATE_ADDRESS);

    expect(sequence.length).toBeGreaterThan(0);
    expect(customSort).toBe(false);
    expect(
      resolveLegacy305Order({ sequence, customSort, registryGroups: buildLegacy305Groups(productionNetworks) }).size
    ).toBe(0);
  });

  it('orders jettons by the group 3.0.5 saved them under', () => {
    seed('ton');
    const { sequence, customSort } = accountController.getLegacy305Preferences(TON_ADDRESS);
    const jettons = [
      jettonGroup('Tether USD', 'usdt', 'EQ_RealTether'),
      jettonGroup('Tether', 'usdt', 'EQ_ImpostorTether'),
      jettonGroup('Notcoin', 'not', 'EQ_Notcoin'),
      jettonGroup('Dogs', 'dogs', 'EQ_Dogs'),
    ];
    const order = resolveLegacy305Order({
      sequence,
      customSort,
      registryGroups: buildLegacy305Groups(productionNetworks),
      jettonGroups: buildLegacy305JettonGroups(jettons, productionNetworks),
    });
    const [{ id: tonId }] = tonNetwork.assets;

    expect(Object.fromEntries(order)).toEqual({
      [tonKey('EQ_Dogs')]: 0,
      [tonKey('EQ_RealTether')]: 1,
      [tonKey('EQ_ImpostorTether')]: 1,
      [tonKey(tonId)]: 2,
      [tonKey('EQ_Notcoin')]: 3,
    });
  });
});

describe('explicit preferences and derived hides', () => {
  it('lets explicit auto and shown override a derived hide, and keeps explicit hidden', () => {
    const merged = mergeAssetPreferences(
      { a: 'auto', b: 'shown', c: 'hidden', d: 'bogus' as never },
      new Set(['a', 'b', 'c', 'd', 'e'])
    );

    expect(merged).toEqual({
      a: { preference: 'auto', source: 'explicit' },
      b: { preference: 'shown', source: 'explicit' },
      c: { preference: 'hidden', source: 'explicit' },
      d: { preference: 'hidden', source: 'legacy305' },
      e: { preference: 'hidden', source: 'legacy305' },
    });
  });
});

describe('reading 3.0.5 storage', () => {
  beforeEach(() => vi.stubGlobal('localStorage', createLocalStorageStub()));

  it('reads each wallet of a shared hide list separately, including an 0x address', () => {
    seed('switches');
    const registryGroups = buildLegacy305Groups(productionNetworks);
    const groups = oracleGroups(productionNetworks);
    const keysOf = (group: TokenGroup) => group.balances.map((balance) => headKey(productionNetworks, balance));

    expect(
      sorted(
        resolveLegacy305Hidden({
          legacyHiddenIds: accountController.getLegacy305Preferences(SUBSTRATE_ADDRESS).hiddenIds,
          registryGroups,
        })
      )
    ).toEqual(
      sorted(new Set([...keysOf(groupOf(groups, 'ksm', 'Kusama')), ...keysOf(groupOf(groups, 'usdt', 'ethereum'))]))
    );
    expect(
      sorted(
        resolveLegacy305Hidden({
          legacyHiddenIds: accountController.getLegacy305Preferences(SECOND_SUBSTRATE_ADDRESS).hiddenIds,
          registryGroups,
        })
      )
    ).toEqual(sorted(new Set(keysOf(groupOf(groups, 'dot', 'Polkadot')))));

    vi.stubGlobal('localStorage', createLocalStorageStub());
    seed('evm-standalone');
    expect(accountController.getLegacy305Preferences(EVM_ADDRESS).hiddenIds).toEqual([
      groupOf(groups, 'eth', 'ethereum').groupId,
      groupOf(groups, 'usdc', 'ethereum').groupId,
    ]);
    expect(accountController.getLegacy305Preferences(EVM_ADDRESS.toLowerCase()).hiddenIds).toEqual([]);
  });

  it.each([
    ['{not json', '{not json', '{not json'],
    ['null', '"a,b"', '[true]'],
    [JSON.stringify({ value: [] }), JSON.stringify({ value: 'a,b' }), JSON.stringify({ value: true })],
    [
      JSON.stringify({ value: { [SUBSTRATE_ADDRESS]: 'not-a-list' } }),
      JSON.stringify({ value: { [SUBSTRATE_ADDRESS]: ['a'] } }),
      JSON.stringify({ value: { [SUBSTRATE_ADDRESS]: 'yes' } }),
    ],
  ])('treats corrupt storage (%s) as empty and leaves it byte-identical', (hidden, sequence, customSort) => {
    localStorage.setItem('account_hidden-assets', hidden);
    localStorage.setItem('account_sequence-assets', sequence);
    localStorage.setItem('account_custom-sort', customSort);

    expect(accountController.getLegacy305Preferences(SUBSTRATE_ADDRESS)).toEqual({
      hiddenIds: [],
      sequence: [],
      customSort: false,
    });
    expect(accountController.getHiddenAssets()).toEqual({});
    expect([hidden, sequence, customSort]).toEqual(LEGACY_KEYS.map((key) => localStorage.getItem(key)));
  });

  it('keeps the well-formed entries of a partly malformed hide list', () => {
    localStorage.setItem(
      'account_hidden-assets',
      JSON.stringify({ value: { [SUBSTRATE_ADDRESS]: ['a', 7, 'b'], [SECOND_SUBSTRATE_ADDRESS]: { x: 1 } } })
    );

    expect(accountController.getHiddenAssets()).toEqual({ [SUBSTRATE_ADDRESS]: ['a', 'b'] });
  });

  it('counts stored ids that no longer name anything, for the diagnostic only', () => {
    expect(
      unmappedLegacy305Ids({
        legacyIds: ['gone-from-registry', groupOf(oracleGroups(productionNetworks), 'dot', 'Polkadot').groupId, ''],
        registryGroups: buildLegacy305Groups(productionNetworks),
      })
    ).toEqual(['gone-from-registry']);
  });
});
