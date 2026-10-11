import { APIItemState } from '@extension-base/api/types/networks';
import { getMockAssets } from '@extension-base/background/helpers/assets';
import { networkMap305, readSnapshot } from '../fixtures/legacy-305/generate';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { buildPortfolioSections, buildPortfolioSummary, filterSectionsBySearch } from '@/portfolio/assetIdentity';
import { APPROVED_GROUPS, parseApprovedGroups, type CanonicalGroupEntry } from '@/portfolio/canonicalGroups';
import { buildCanonicalGroupIndex, canonicalGroupOf } from '@/portfolio/tokenGroups';
import {
  buildTokenRows,
  groupReceiveOptions,
  groupSendOptions,
  splitZeroTokenRows,
  tokenRowKeys,
  type PortfolioTokenRow,
} from '@/portfolio/tokenLens';
import { registryAssetKey } from '@/portfolio/zeroRule';
import { mergeUniversalWalletRegistryNetworks } from '@/util/universalWalletRegistryNetworks';

// The production registry the shared groups file was reviewed against, plus the app-owned Bitcoin, Solana and
// Iroha networks the runtime adds to it.
const networkMap = networkMap305(readSnapshot());
mergeUniversalWalletRegistryNetworks(networkMap, undefined);
const networks = Object.values(networkMap).map((network) => ({ ...network, favorite: [] })) as NetworkJson[];
const byName = (name: string) => networks.find((network) => network.name === name)!;
const keyOf = (networkName: string, symbol: string) => {
  const network = byName(networkName);
  return registryAssetKey(network, network.assets.find((asset) => asset.symbol === symbol)!);
};

const PRICES = { polkadot: 5, kusama: 20, ethereum: 2000, tether: 1, 'usd-coin': 1 };

function substrateBalances(): TokenGroup[] {
  const groups = getMockAssets(networkMap, WalletEcosystem.Substrate);
  groups.forEach(({ balances }) =>
    balances.forEach((balance) => Object.assign(balance, { state: APIItemState.READY, total: '0', transferable: '0' }))
  );
  return groups;
}

function fund(groups: TokenGroup[], networkName: string, symbol: string, total: string, transferable = total) {
  const items = groups
    .flatMap(({ balances }) => balances)
    .filter((balance) => balance.name === networkName.toLowerCase() && balance.symbol === symbol);
  if (!items.length) throw new Error(`No ${symbol} on ${networkName}`);
  items.forEach((balance) => Object.assign(balance, { total, transferable }));
}

const index = buildCanonicalGroupIndex({ networks });

function rowsFor(
  groups: TokenGroup[],
  options: { preferences?: Record<string, 'hidden' | 'shown'>; showHidden?: boolean; search?: string; prices?: Record<string, number> } = {}
): PortfolioTokenRow[] {
  const sections = buildPortfolioSections({
    groups,
    networks,
    prices: options.prices ?? PRICES,
    preferences: options.preferences ?? {},
    addressForNetwork: () => 'wallet',
    showHidden: options.showHidden,
    // Only funded rows, so each case reads exactly what it funded.
    isDefaultVisibleAtZero: () => false,
  });

  return buildTokenRows({
    sections: filterSectionsBySearch(sections, options.search),
    index,
    networkRank: (name) => byName(name)?.rank ?? Number.POSITIVE_INFINITY,
  });
}

const describeRow = (row: PortfolioTokenRow) => ({
  symbol: row.symbol,
  networks: [...row.children, ...row.zeroChildren].map(({ asset, role }) => `${asset.networkName}${role ? `:${role}` : ''}`),
  amount: row.balanceText,
  fiat: row.fiatValue,
});

describe('canonical token groups against the reviewed registry', () => {
  it('resolves every member of every approved group, each to its own key, with nothing left out', () => {
    expect(index.diagnostics).toEqual([]);
    expect([...index.groups.keys()].sort()).toEqual(['btc', 'dot', 'eth', 'ksm', 'usdc', 'usdt']);

    APPROVED_GROUPS.forEach((group) => {
      expect(index.groups.get(group.id)!.members.map(({ chainId, role }) => [chainId, role])).toEqual(
        group.members.map(({ chainId, role }) => [chainId, role])
      );
    });
    const keys = [...index.groups.values()].flatMap(({ members }) => members.map(({ key }) => key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never groups by symbol or price id: vKSM, vsKSM, WETH, bridged USDT and the untrusted Kusama USDT stay out', () => {
    const outside = [
      keyOf('Bifrost', 'vksm'),
      keyOf('Bifrost', 'vsksm'),
      keyOf('Polygon', 'usdt'),
      keyOf('Arbitrum One', 'usdt'),
      keyOf('Kusama AssetHub', 'usdt'),
      keyOf('BNB Smart Chain', 'usdc'),
    ];

    outside.forEach((key) => expect(index.memberOfKey.has(key), key).toBe(false));
    expect(index.memberOfKey.get(keyOf('Kusama', 'ksm'))).toMatchObject({ groupId: 'ksm', role: 'native' });
    expect(index.memberOfKey.get(keyOf('Polkadot AssetHub', 'usdt'))).toMatchObject({ groupId: 'usdt', role: 'issuer-native' });
  });

  it('finds the group of a registry asset by network and id, EVM contract ids in any case', () => {
    expect(canonicalGroupOf(index, byName('Ethereum'), '0xDAC17F958D2EE523A2206206994597C13D831EC7')?.group.id).toBe('usdt');
    expect(canonicalGroupOf(index, byName('Polygon'), '0xc2132D05D31c914a87C6611C10748AEb04B58e8F')).toBeUndefined();
    expect(canonicalGroupOf(index, undefined, 'x')).toBeUndefined();
  });

  const member = (chainId: string, assetId: string, symbol: string, precision: number) => ({
    chainId,
    assetId,
    symbol,
    precision,
    role: 'native',
    network: chainId,
  });
  const dot = byName('Polkadot');
  const assetHub = byName('Polkadot AssetHub');
  const testGroup = (id: string, members: CanonicalGroupEntry['members']): CanonicalGroupEntry => ({ id, symbol: id, name: id, members });

  it('fails safe: another format or version, a proposed group or a malformed member renders no group', () => {
    const document = { format: 'fearless.canonical-asset-groups', version: 1, groups: [{ id: 'dot', symbol: 'DOT', status: 'approved', members: [member(dot.chainId, dot.assets[0].id, 'dot', 10)] }] };

    expect(parseApprovedGroups(document)).toHaveLength(1);
    expect(parseApprovedGroups({ ...document, version: 2 })).toEqual([]);
    expect(parseApprovedGroups({ ...document, format: 'other' })).toEqual([]);
    expect(parseApprovedGroups({ ...document, groups: [{ ...document.groups[0], status: 'proposed' }] })).toEqual([]);
    expect(parseApprovedGroups({ ...document, groups: [{ ...document.groups[0], members: [{ chainId: dot.chainId }] }] })).toEqual([]);
    expect(parseApprovedGroups({ ...document, groups: [{ ...document.groups[0], id: 'Not An Id' }] })).toEqual([]);
  });

  it('drops every group that shares a member, so a bad file can only split rows', () => {
    const shared = member(dot.chainId, dot.assets[0].id, 'dot', 10);
    const result = buildCanonicalGroupIndex({
      networks,
      groups: [
        testGroup('a', [shared, member(assetHub.chainId, assetHub.assets[0].id, 'dot', 10)]),
        testGroup('b', [shared]),
        testGroup('c', [member('1', '0xdac17f958d2ee523a2206206994597c13d831ec7', 'usdt', 6)]),
      ],
    });

    expect([...result.groups.keys()]).toEqual(['c']);
    expect(result.diagnostics.join('\n')).toContain('is claimed twice');
  });

  it('skips a member whose registry entry changed, sits on a testnet or has an untrusted price', () => {
    const result = buildCanonicalGroupIndex({
      networks,
      groups: [
        testGroup('a', [
          member(dot.chainId, dot.assets[0].id, 'dot', 12),
          member(assetHub.chainId, assetHub.assets[0].id, 'dot', 10),
          member('48239ef607d7928874027a43a67689209727dfb3d3dc5e5b03a39bdc2eda771a', '27768227-8a9a-4443-a57d-6013c24f85e9', 'usdt', 4),
          member('unknown-chain', 'x', 'x', 1),
          // EVM contract ids match in any case.
          member('1', '0xDAC17F958D2EE523A2206206994597C13D831EC7', 'USDT', 6),
        ]),
      ],
      isTestnet: (network) => network.chainId === assetHub.chainId,
    });

    expect(result.groups.get('a')!.members.map(({ networkName }) => networkName)).toEqual(['Ethereum']);
    expect(result.diagnostics).toHaveLength(4);
  });
});

describe('By token rows', () => {
  it('combines the DOT group across the relay chain and its parachains, each child labelled with its role', () => {
    const groups = substrateBalances();
    fund(groups, 'Polkadot', 'dot', '10', '4');
    fund(groups, 'Polkadot AssetHub', 'dot', '2');
    fund(groups, 'Hydration', 'dot', '1');

    const [row] = rowsFor(groups);
    expect(describeRow(row)).toEqual({
      symbol: 'DOT',
      networks: ['Polkadot:native', 'Polkadot AssetHub:system-parachain', 'Hydration:xcm-reserve'],
      amount: '13',
      fiat: '65',
    });
    expect(row).toMatchObject({ id: 'group:dot', groupId: 'dot', name: 'Polkadot', networkCount: 3, transferableText: '7' });
    expect(row.networkIcon).toBe(byName('Polkadot').icon);
  });

  it('keeps bridged USDT and the untrusted Kusama "USDT" as their own rows, labelled with the network', () => {
    const groups = substrateBalances();
    fund(groups, 'Ethereum', 'usdt', '40');
    fund(groups, 'Polkadot AssetHub', 'usdt', '5');
    fund(groups, 'Polygon', 'usdt', '2');
    fund(groups, 'Kusama AssetHub', 'usdt', '50000');

    const rows = rowsFor(groups).map(describeRow);
    expect(rows).toEqual([
      { symbol: 'USDT', networks: ['Ethereum:issuer-native', 'Polkadot AssetHub:issuer-native'], amount: '45', fiat: '45' },
      { symbol: 'USDT', networks: ['Polygon'], amount: '2', fiat: '2' },
      // No trusted price: it adds nothing, whatever the registry says.
      { symbol: 'USDT', networks: ['Kusama AssetHub'], amount: '50000', fiat: null },
    ]);
  });

  it('never lends a price: a member without one adds its amount but no fiat, and the row says so', () => {
    const groups = substrateBalances();
    fund(groups, 'Ethereum', 'usdt', '40');
    fund(groups, 'Polkadot AssetHub', 'usdt', '5');
    // The live registry lost the AssetHub price id: its 5 USDT must not be valued at Ethereum's price.
    const unpricedNetworks = networks.map((network) =>
      network.name === 'Polkadot AssetHub'
        ? { ...network, assets: network.assets.map((asset) => (asset.symbol === 'usdt' ? { ...asset, priceId: '' } : asset)) }
        : network
    );
    const sections = buildPortfolioSections({
      groups,
      networks: unpricedNetworks,
      prices: PRICES,
      preferences: {},
      addressForNetwork: () => 'wallet',
      isDefaultVisibleAtZero: () => false,
    });

    const [row] = buildTokenRows({ sections, index });
    expect(row).toMatchObject({ symbol: 'USDT', balanceText: '45', fiatValue: '40', unpricedNetworkCount: 1 });
  });

  it('adds up to the header total, and a hidden member is excluded from the row as from the header', () => {
    const groups = substrateBalances();
    fund(groups, 'Kusama', 'ksm', '3');
    fund(groups, 'Kusama AssetHub', 'ksm', '1');
    fund(groups, 'Polkadot', 'dot', '2');
    const preferences = { [keyOf('Kusama AssetHub', 'ksm')]: 'hidden' as const };

    const rows = rowsFor(groups, { preferences });
    expect(rows.map(describeRow)).toEqual([
      { symbol: 'KSM', networks: ['Kusama:native'], amount: '3', fiat: '60' },
      { symbol: 'DOT', networks: ['Polkadot:native'], amount: '2', fiat: '10' },
    ]);
    const summary = buildPortfolioSummary({ groups, networks, prices: PRICES, preferences, addressForNetwork: () => 'wallet' });
    expect(summary.total).toBe('70');

    // With "Show hidden" the hidden network is listed with its chip, still left out of the row's value.
    const [ksm] = rowsFor(groups, { preferences, showHidden: true });
    expect(describeRow(ksm)).toEqual({
      symbol: 'KSM',
      networks: ['Kusama:native', 'Kusama AssetHub:system-parachain'],
      amount: '3',
      fiat: '60',
    });
    expect(ksm.children.map(({ asset }) => asset.hidden)).toEqual([false, true]);
    expect(ksm.hidden).toBe(false);
  });

  it('never groups KSM with vKSM and vsKSM, which share its registry price id', () => {
    const groups = substrateBalances();
    fund(groups, 'Kusama', 'ksm', '1');
    fund(groups, 'Bifrost', 'ksm', '1');
    fund(groups, 'Bifrost', 'vksm', '1');
    fund(groups, 'Bifrost', 'vsksm', '1');

    expect(rowsFor(groups).map(({ symbol, networkCount }) => `${symbol}:${networkCount}`).sort()).toEqual([
      'KSM:2',
      'VKSM:1',
      'VSKSM:1',
    ]);
  });

  it('shows a group with one member on screen as a plain row on its network', () => {
    const groups = substrateBalances();
    fund(groups, 'Polkadot AssetHub', 'dot', '2');

    const [row] = rowsFor(groups);
    expect(row).toMatchObject({ id: keyOf('Polkadot AssetHub', 'dot'), symbol: 'DOT', networkCount: 1 });
    expect(row.children[0].role).toBe('system-parachain');
  });

  it('collapses zero networks under the funded ones and zero rows under the funded rows', () => {
    const groups = substrateBalances();
    fund(groups, 'Polkadot AssetHub', 'dot', '2');
    const sections = buildPortfolioSections({
      groups,
      networks,
      prices: PRICES,
      preferences: { [keyOf('Polkadot', 'dot')]: 'shown', [keyOf('Kusama', 'ksm')]: 'shown' },
      addressForNetwork: () => 'wallet',
      isDefaultVisibleAtZero: () => false,
    });

    const rows = buildTokenRows({ sections, index });
    const { funded, zeroOnly } = splitZeroTokenRows(rows);
    expect(funded.map(describeRow)).toEqual([
      { symbol: 'DOT', networks: ['Polkadot AssetHub:system-parachain', 'Polkadot:native'], amount: '2', fiat: '10' },
    ]);
    expect(funded[0].zeroChildren.map(({ asset }) => asset.networkName)).toEqual(['Polkadot']);
    expect(zeroOnly.map(({ symbol }) => symbol)).toEqual(['KSM']);
    expect(tokenRowKeys(funded[0]).sort()).toEqual([keyOf('Polkadot', 'dot'), keyOf('Polkadot AssetHub', 'dot')].sort());
  });

  it('never shows a balance nobody could load as zero: the row says so and stays with the funded rows', () => {
    const groups = substrateBalances();
    fund(groups, 'Polkadot AssetHub', 'dot', '2');
    fund(groups, 'Kusama', 'ksm', '3');
    // What the background keeps after a failed update: the amount a provider last confirmed, or none at all.
    const failed = (target: TokenGroup[], networkName: string, symbol: string, lastConfirmed?: string) =>
      target
        .flatMap(({ balances }) => balances)
        .filter((balance) => balance.name === networkName.toLowerCase() && balance.symbol === symbol)
        .forEach((balance) => Object.assign(balance, { state: APIItemState.ERROR, total: lastConfirmed, transferable: lastConfirmed }));
    failed(groups, 'Polkadot', 'dot');
    failed(groups, 'Kusama', 'ksm', '3');

    const { funded, zeroOnly } = splitZeroTokenRows(rowsFor(groups));
    const [dot, ksm] = ['DOT', 'KSM'].map((symbol) => funded.find((row) => row.symbol === symbol)!);

    // Polkadot is listed with the funded networks, adds nothing, and the row's amount is what is known.
    expect(describeRow(dot)).toEqual({
      symbol: 'DOT',
      networks: ['Polkadot AssetHub:system-parachain', 'Polkadot:native'],
      amount: '2',
      fiat: '10',
    });
    expect(dot.children.map(({ asset }) => [asset.networkName, asset.balanceUnavailable])).toEqual([
      ['Polkadot AssetHub', false],
      ['Polkadot', true],
    ]);
    expect(dot).toMatchObject({ unavailableNetworkCount: 1, balanceUnavailable: false, balanceFailed: true, zeroChildren: [] });
    // The last confirmed amount stays, marked as out of date.
    expect(ksm).toMatchObject({ balanceText: '3', fiatValue: '60', unavailableNetworkCount: 0, balanceUnavailable: false, balanceFailed: true });
    expect(zeroOnly).toEqual([]);

    // Alone on screen, the failed network is a row that says so, ahead of the zero rows and not folded under them.
    const alone = substrateBalances();
    failed(alone, 'Polkadot', 'dot');
    const shown = buildPortfolioSections({
      groups: alone,
      networks,
      prices: PRICES,
      preferences: { [keyOf('Kusama', 'ksm')]: 'shown' },
      addressForNetwork: () => 'wallet',
      isDefaultVisibleAtZero: () => false,
    });
    const rows = buildTokenRows({ sections: shown, index });

    expect(rows.map(({ id }) => id)).toEqual([keyOf('Polkadot', 'dot'), keyOf('Kusama', 'ksm')]);
    expect(rows[0]).toMatchObject({ hasBalance: false, balanceUnavailable: true, unavailableNetworkCount: 1, fiatValue: null });
    expect(splitZeroTokenRows(rows).funded).toEqual([rows[0]]);
    expect(splitZeroTokenRows(rows).zeroOnly.map(({ symbol }) => symbol)).toEqual(['KSM']);
  });

  it('searches within groups: a token name keeps the whole group, a network name only that network', () => {
    const groups = substrateBalances();
    fund(groups, 'Ethereum', 'usdt', '40');
    fund(groups, 'Polkadot AssetHub', 'usdt', '5');
    fund(groups, 'Polkadot AssetHub', 'dot', '1');
    fund(groups, 'Polkadot', 'dot', '1');

    expect(rowsFor(groups, { search: 'usdt' }).map(describeRow)).toEqual([
      { symbol: 'USDT', networks: ['Ethereum:issuer-native', 'Polkadot AssetHub:issuer-native'], amount: '45', fiat: '45' },
    ]);
    expect(rowsFor(groups, { search: 'ethereum' }).map(({ symbol, networkCount }) => `${symbol}:${networkCount}`)).toEqual(['USDT:1']);
  });

  it('keeps the 3.0.5 custom order for rows it covers, and value order for the rest', () => {
    const groups = substrateBalances();
    fund(groups, 'Polkadot', 'dot', '100');
    fund(groups, 'Ethereum', 'eth', '1');
    fund(groups, 'Ethereum', 'usdc', '10');
    const sections = buildPortfolioSections({
      groups,
      networks,
      prices: PRICES,
      preferences: {},
      addressForNetwork: () => 'wallet',
      isDefaultVisibleAtZero: () => false,
    });
    const legacyOrderIndex = new Map([
      [keyOf('Ethereum', 'usdc'), 0],
      [keyOf('Polkadot', 'dot'), 1],
    ]);

    const symbols = (sort: 'value' | 'custom') =>
      buildTokenRows({ sections, index, sort, legacyOrderIndex }).map(({ symbol }) => symbol);
    expect(symbols('value')).toEqual(['ETH', 'DOT', 'USDC']);
    expect(symbols('custom')).toEqual(['USDC', 'DOT', 'ETH']);
  });
});

describe('network choice for Send and Receive from a token row', () => {
  it('offers Send only on funded, visible networks that can send, and Receive on every member the wallet can use', () => {
    const groups = substrateBalances();
    fund(groups, 'Polkadot', 'dot', '10', '4');
    fund(groups, 'Polkadot AssetHub', 'dot', '2');
    const [row] = rowsFor(groups);

    expect(groupSendOptions(row, () => true).map(({ networkName, amountText }) => [networkName, amountText])).toEqual([
      ['Polkadot', '4'],
      ['Polkadot AssetHub', '2'],
    ]);
    expect(groupSendOptions(row, (name) => name !== 'Polkadot').map(({ networkName }) => networkName)).toEqual(['Polkadot AssetHub']);

    const receive = groupReceiveOptions({ row, group: index.groups.get('dot'), networks, inScope: () => true });
    expect(receive.slice(0, 2).map(({ networkName }) => networkName)).toEqual(['Polkadot', 'Polkadot AssetHub']);
    expect(receive.map(({ networkName }) => networkName).sort()).toEqual(
      index.groups.get('dot')!.members.map(({ networkName }) => networkName).sort()
    );
    const hydration = receive.find(({ networkName }) => networkName === 'Hydration');
    expect(hydration).toMatchObject({ role: 'xcm-reserve', assetId: byName('Hydration').assets.find(({ symbol }) => symbol === 'dot')!.id });
    expect(hydration!.amountText).toBeUndefined();

    // A wallet without an account on a network is never offered it.
    const scoped = groupReceiveOptions({ row, group: index.groups.get('dot'), networks, inScope: (network) => network.name !== 'Hydration' });
    expect(scoped.map(({ networkName }) => networkName)).not.toContain('Hydration');
  });
});
