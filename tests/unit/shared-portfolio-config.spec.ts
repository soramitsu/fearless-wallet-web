import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APIItemState } from '@extension-base/api/types/networks';
import { getMockAssets } from '@extension-base/background/helpers/assets';
import { networkMap305, readSnapshot } from '../fixtures/legacy-305/generate';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { buildPortfolioSections, buildPortfolioSummary, scopeNetworksToWallet } from '@/portfolio/assetIdentity';
import {
  CANONICAL_ASSET_GROUPS_SHA256,
  DEFAULT_VISIBLE_AT_ZERO,
  DEFAULT_VISIBLE_AT_ZERO_SHA256,
  TESTNET_CHAIN_IDS,
  TESTNET_CHAIN_IDS_SHA256,
  UNTRUSTED_ASSETS,
  parseDefaultVisibleAtZero,
  parseTestnetChainIds,
  parseUntrustedAssets,
} from '@/portfolio/canonicalGroups';
import { createUntrustedAssetCheck } from '@/portfolio/untrustedAssets';
import { buildCanonicalGroupIndex } from '@/portfolio/tokenGroups';
import { buildTokenRows } from '@/portfolio/tokenLens';
import { createAssetKey } from '@/portfolio/assetKey';
import { createZeroDefaultRule, isTestnetNetwork, registryAssetKey } from '@/portfolio/zeroRule';
import { mergeUniversalWalletRegistryNetworks } from '@/util/universalWalletRegistryNetworks';

const repositoryFile = (path: string): Buffer => readFileSync(resolve(__dirname, '../..', path));
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

// Byte copy of the root workspace's config/portfolio/parity-cases.v1.json (critique T-5).
const PARITY_CASES_PATH = 'tests/fixtures/portfolio/parity-cases.v1.json';
const PARITY_CASES_SHA256 = 'aab5746a3bf2aa75d661266c75ebea37138cde8aacd426e08508c06d2e5daa81';

type ParityAccount = 'substrate' | 'evm' | 'ton' | 'bitcoin' | 'solana';
interface ZeroDefaultsCase {
  id: string;
  accounts: ParityAccount[];
  sendPausedChainIds?: string[];
  expected: string[];
}

describe('shared portfolio configuration', () => {
  it.each([
    ['src/portfolio/data/canonical-asset-groups.v1.json', CANONICAL_ASSET_GROUPS_SHA256],
    ['src/portfolio/data/testnet-chain-ids.v1.json', TESTNET_CHAIN_IDS_SHA256],
    ['src/portfolio/data/default-visible-at-zero.v1.json', DEFAULT_VISIBLE_AT_ZERO_SHA256],
    [PARITY_CASES_PATH, PARITY_CASES_SHA256],
  ])('bundles %s byte for byte as pinned', (path, pinned) => {
    expect(pinned).toMatch(/^[0-9a-f]{64}$/u);
    expect(sha256(repositoryFile(path))).toBe(pinned);
  });

  it('reads the bundled testnet and zero-default lists against the reviewed registry snapshot', () => {
    expect(TESTNET_CHAIN_IDS.size).toBe(19);
    // Enabled test networks the registry ships without the `testnet` option.
    ['72778', 'd3d2f3a3495dc597434a99d7d449ebad6616db45e4e4f178f31cc6fa14378b70', 'fc56984b-2be7-431d-840e-21514d1883f0']
      .forEach((chainId) => expect(TESTNET_CHAIN_IDS.has(chainId), chainId).toBe(true));
    expect(DEFAULT_VISIBLE_AT_ZERO).toHaveLength(18);

    const groups = JSON.parse(repositoryFile('src/portfolio/data/canonical-asset-groups.v1.json').toString('utf8'));
    const zero = JSON.parse(repositoryFile('src/portfolio/data/default-visible-at-zero.v1.json').toString('utf8'));
    expect(groups.registry.snapshotSha256).toBe(sha256(repositoryFile('tests/fixtures/legacy-305/chains-v13.snapshot.json')));
    expect(zero.registry.snapshotSha256).toBe(groups.registry.snapshotSha256);
  });

  it('fails safe on a document of another format or version', () => {
    expect(parseTestnetChainIds({ format: 'fearless.testnet-chain-ids', version: 2, chainIds: [{ chainId: '1' }] }).size).toBe(0);
    expect(parseTestnetChainIds(null).size).toBe(0);
    expect(parseDefaultVisibleAtZero({ format: 'other', version: 1, entries: [{ chainId: '1', assetId: 'a' }] })).toBeUndefined();
    expect(parseDefaultVisibleAtZero({ format: 'fearless.default-visible-at-zero', version: 1, entries: [] })).toBeUndefined();
    expect(
      parseDefaultVisibleAtZero({
        format: 'fearless.default-visible-at-zero',
        version: 1,
        entries: [{ chainId: '1', assetId: 'eth' }, { chainId: ' padded', assetId: 'x' }, 'junk'],
      })
    ).toEqual([{ chainId: '1', assetId: 'eth' }]);
  });

  it('reads the untrusted list and fails safe on a document of another format or version', () => {
    expect(UNTRUSTED_ASSETS).toEqual([
      { chainId: '48239ef607d7928874027a43a67689209727dfb3d3dc5e5b03a39bdc2eda771a', assetId: '27768227-8a9a-4443-a57d-6013c24f85e9' },
    ]);
    expect(parseUntrustedAssets(null)).toEqual([]);
    expect(parseUntrustedAssets({ format: 'fearless.canonical-asset-groups', version: 1 })).toEqual([]);
    expect(
      parseUntrustedAssets({ format: 'fearless.canonical-asset-groups', version: 2, untrustedAssets: [{ chainId: '1', assetId: 'a' }] })
    ).toEqual([]);
    expect(
      parseUntrustedAssets({
        format: 'fearless.canonical-asset-groups',
        version: 1,
        untrustedAssets: [{ chainId: '1', assetId: '0xAbC' }, { chainId: ' padded', assetId: 'x' }, { chainId: '1' }, 'junk'],
      })
    ).toEqual([{ chainId: '1', assetId: '0xAbC' }]);
  });

  it('matches untrusted registry ids exactly, and EVM contract ids without regard to case', () => {
    const isUntrusted = createUntrustedAssetCheck([
      { chainId: '1', assetId: '0xAbC' },
      { chainId: 'kusama-asset-hub', assetId: 'Asset-Id' },
    ]);

    expect(isUntrusted({ chainId: '1', ecosystem: 'ethereum' }, '0xabc')).toBe(true);
    expect(isUntrusted({ chainId: '1', ecosystem: 'ethereumBased' }, '0xABC')).toBe(true);
    expect(isUntrusted({ chainId: '10', ecosystem: 'ethereum' }, '0xabc')).toBe(false);
    expect(isUntrusted({ chainId: 'kusama-asset-hub', ecosystem: 'substrate' }, 'Asset-Id')).toBe(true);
    expect(isUntrusted({ chainId: 'kusama-asset-hub', ecosystem: 'substrate' }, 'asset-id')).toBe(false);
  });

  it('treats the shared list and the registry option as testnets', () => {
    expect(isTestnetNetwork({ chainId: '72778', options: ['ethereum'] } as never)).toBe(true);
    expect(isTestnetNetwork({ chainId: 'westend', options: ['testnet'] } as never)).toBe(true);
    expect(isTestnetNetwork({ chainId: '1', options: ['ethereum'] } as never)).toBe(false);
  });

  it('falls back to the primary utility asset of ranked mainnets when the zero list is unusable', () => {
    const networks = Object.values(networkMap305(readSnapshot()));
    const rule = createZeroDefaultRule({ networks, entries: undefined });
    const keyOf = (name: string, symbol: string) => {
      const network = networks.find((candidate) => candidate.name === name)!;
      return [network, registryAssetKey(network, network.assets.find((asset) => asset.symbol === symbol)!)] as const;
    };

    expect(rule(...keyOf('Polkadot', 'dot'))).toBe(true);
    expect(rule(...keyOf('X Layer Mainnet', 'okb'))).toBe(true);
    expect(rule(...keyOf('X Layer Mainnet', 'wokb'))).toBe(false);
    expect(rule(...keyOf('Acala', 'aca'))).toBe(false);
  });
});

describe('portfolio parity cases (zero defaults per wallet type)', () => {
  const parity = JSON.parse(repositoryFile(PARITY_CASES_PATH).toString('utf8')) as { zeroDefaults: ZeroDefaultsCase[] };
  const networkMap = networkMap305(readSnapshot());
  // The runtime adds the bundled Bitcoin, Solana and Iroha networks to the remote registry.
  mergeUniversalWalletRegistryNetworks(networkMap, undefined);
  const networks = Object.values(networkMap).map((network) => ({ ...network, favorite: [] })) as NetworkJson[];
  const labels = new Map(
    networks.flatMap((network) => network.assets.map((asset) => [registryAssetKey(network, asset), `${asset.symbol}@${network.name}`]))
  );
  const mockEcosystem: Record<ParityAccount, WalletEcosystem> = {
    substrate: WalletEcosystem.Substrate,
    evm: WalletEcosystem.Substrate,
    ton: WalletEcosystem.Ton,
    bitcoin: WalletEcosystem.Bitcoin,
    solana: WalletEcosystem.Solana,
  };

  it.each(parity.zeroDefaults.map((testCase) => [testCase.id, testCase] as const))('%s', (_id, testCase) => {
    const ecosystems = [...new Set(testCase.accounts.map((account) => mockEcosystem[account]))];
    const groups = ecosystems.flatMap((ecosystem) => getMockAssets(networkMap, ecosystem));
    groups.forEach(({ balances }) =>
      balances.forEach((balance) => Object.assign(balance, { state: APIItemState.READY, total: '0', transferable: '0' }))
    );
    const account = {
      universalWallet: {
        publicAccounts: testCase.accounts.map((ecosystem) => ({ ecosystem, address: `${ecosystem}-address` })),
      },
    } as never;
    const rule = createZeroDefaultRule({
      networks,
      isSendVetoed: (network) => (testCase.sendPausedChainIds ?? []).includes(network.chainId),
    });

    const rows = buildPortfolioSections({
      groups,
      networks,
      prices: {},
      preferences: {},
      addressForNetwork: () => 'wallet',
      isDefaultVisibleAtZero: (network, asset) => rule(network, asset.key),
      walletScope: scopeNetworksToWallet(account, {
        ethereumAddress: testCase.accounts.includes('evm') ? '0x9858EfFD232B4033E47d90003D41EC34EcaEda94' : '',
      }),
    }).flatMap(({ assets }) => assets.map(({ key }) => labels.get(key) ?? key));

    expect([...rows].sort()).toEqual([...testCase.expected].sort());
  });
});

// Portfolio contract §10: every `untrustedAssets` entry gets a balance and its registry price, adds 0 fiat to the
// header and is counted as without price.
describe('untrusted registry prices', () => {
  // The registry exactly as published: the listed asset still carries its registry `priceId`.
  const networks = Object.values(networkMap305(readSnapshot())).map((network) => ({ ...network, favorite: [] })) as NetworkJson[];
  const document = JSON.parse(repositoryFile('src/portfolio/data/canonical-asset-groups.v1.json').toString('utf8')) as {
    untrustedAssets: Array<{ chainId: string; assetId: string; symbol: string; precision: number; registryPriceId: string }>;
    groups: Array<{ members: Array<{ chainId: string; assetId: string }> }>;
  };

  it('lists registry assets exactly as the reviewed snapshot has them, and in no group', () => {
    expect(document.untrustedAssets.length).toBeGreaterThan(0);
    expect(document.untrustedAssets.map(({ chainId, assetId }) => ({ chainId, assetId }))).toEqual(UNTRUSTED_ASSETS);

    document.untrustedAssets.forEach((entry) => {
      const asset = networks.find(({ chainId }) => chainId === entry.chainId)?.assets.find(({ id }) => id === entry.assetId);

      expect(asset, entry.assetId).toMatchObject({ symbol: entry.symbol, precision: entry.precision, priceId: entry.registryPriceId });
      expect(
        document.groups.some(({ members }) => members.some((member) => member.chainId === entry.chainId && member.assetId === entry.assetId))
      ).toBe(false);
    });
  });

  it.each(document.untrustedAssets.map((entry) => [`${entry.symbol} ${entry.assetId}`, entry] as const))(
    'gives %s no price: 0 fiat in the header, counted as without price',
    (_label, entry) => {
      const network = networks.find(({ chainId }) => chainId === entry.chainId)!;
      const groups = getMockAssets({ [network.name]: network }, WalletEcosystem.Substrate);
      groups.forEach(({ balances }) =>
        balances.forEach((balance) =>
          Object.assign(balance, {
            state: APIItemState.READY,
            total: balance.id === entry.assetId ? '50000' : '0',
            transferable: balance.id === entry.assetId ? '50000' : '0',
          })
        )
      );
      // The registry price exists and is positive, so only the list keeps it out.
      const input = { groups, networks, prices: { [entry.registryPriceId]: 1 }, addressForNetwork: () => 'wallet' };
      const rowOf = (sections: ReturnType<typeof buildPortfolioSections>) =>
        sections.flatMap(({ assets }) => assets).find(({ assetId }) => assetId === entry.assetId);

      expect(buildPortfolioSummary(input)).toMatchObject({ total: '0', unpricedCount: 1, hiddenCount: 0 });
      const [section] = buildPortfolioSections({ ...input, preferences: {} });
      expect(rowOf([section])).toMatchObject({
        balanceText: '50000',
        hasBalance: true,
        trust: 'verified',
        fiatValue: null,
        hasPrice: false,
        unitPrice: null,
        priceTrust: 'unavailable',
      });
      expect(section).toMatchObject({ subtotal: '0', hasPricedAssets: false });

      // Without the list the registry price would count, as it did before the list existed.
      const unlisted = { ...input, isUntrusted: () => false };
      expect(buildPortfolioSummary(unlisted)).toMatchObject({ total: '50000', unpricedCount: 0 });
      expect(rowOf(buildPortfolioSections({ ...unlisted, preferences: {} }))).toMatchObject({ fiatValue: '50000', priceTrust: 'canonicalAsset' });
    }
  );
});

// Portfolio contract §2 and §6: the approved groups of the shared file, replayed through the extension's own loader,
// key mapping and By token rows. Android and iOS replay the same file in their consumer tests.
describe('portfolio parity cases (approved token groups)', () => {
  const networkMap = networkMap305(readSnapshot());
  mergeUniversalWalletRegistryNetworks(networkMap, undefined);
  const networks = Object.values(networkMap).map((network) => ({ ...network, favorite: [] })) as NetworkJson[];
  const document = JSON.parse(repositoryFile('src/portfolio/data/canonical-asset-groups.v1.json').toString('utf8')) as {
    groups: Array<{
      id: string;
      symbol: string;
      status: string;
      priceId: string;
      members: Array<{ chainId: string; assetId: string; symbol: string; precision: number; role: string }>;
    }>;
  };
  const approved = document.groups.filter(({ status }) => status === 'approved');
  const proposed = document.groups.filter(({ status }) => status !== 'approved');
  const index = buildCanonicalGroupIndex({ networks });
  const networkOf = (chainId: string) => networks.find((network) => network.chainId === chainId)!;

  /** Every registry asset funded with one unit, on every network a universal wallet holds an account for. */
  function fundedEverywhere(): ReturnType<typeof getMockAssets> {
    const groups = [WalletEcosystem.Substrate, WalletEcosystem.Bitcoin].flatMap((ecosystem) => getMockAssets(networkMap, ecosystem));
    groups.forEach(({ balances }) =>
      balances.forEach((balance) => Object.assign(balance, { state: APIItemState.READY, total: '1', transferable: '1' }))
    );
    return groups;
  }

  it('resolves exactly the approved members against the reviewed registry, each to one extension key', () => {
    expect(approved.map(({ id }) => id).sort()).toEqual([...index.groups.keys()].sort());
    expect(index.diagnostics).toEqual([]);

    approved.forEach((group) =>
      group.members.forEach((member) => {
        const network = networkOf(member.chainId);
        const key = createAssetKey({ ecosystem: String(network.ecosystem), chainId: member.chainId, assetId: member.assetId });

        expect(index.memberOfKey.get(key), `${group.id} ${member.chainId}`).toMatchObject({ groupId: group.id, role: member.role });
      })
    );
    expect(index.memberOfKey.size).toBe(approved.reduce((count, { members }) => count + members.length, 0));
  });

  it.each(approved.map((group) => [group.id, group] as const))('renders the %s group as one row over all its members', (_id, group) => {
    const sections = buildPortfolioSections({
      groups: fundedEverywhere(),
      networks,
      prices: { [group.priceId]: 2 },
      preferences: {},
      addressForNetwork: () => 'wallet',
    });
    const rows = buildTokenRows({ sections, index }).filter((row) =>
      [...row.children, ...row.zeroChildren].some(({ asset }) => index.memberOfKey.get(asset.key)?.groupId === group.id)
    );

    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toMatchObject({
      symbol: group.symbol,
      networkCount: group.members.length,
      balanceText: String(group.members.length),
      fiatValue: String(group.members.length * 2),
    });
    // A one-member group is a plain row, labelled with its network.
    expect(row.groupId).toBe(group.members.length > 1 ? group.id : undefined);
  });

  it('never renders a proposed group: each of its members stays a row of its own', () => {
    const sections = buildPortfolioSections({
      groups: fundedEverywhere(),
      networks,
      prices: {},
      preferences: {},
      addressForNetwork: () => 'wallet',
    });
    const rows = buildTokenRows({ sections, index });
    const proposedKeys = new Set(
      proposed.flatMap(({ members }) =>
        members.map(({ chainId, assetId }) =>
          createAssetKey({ ecosystem: String(networkOf(chainId).ecosystem), chainId, assetId })
        )
      )
    );

    expect(proposedKeys.size).toBeGreaterThan(0);
    rows
      .filter((row) => [...row.children, ...row.zeroChildren].some(({ asset }) => proposedKeys.has(asset.key)))
      .forEach((row) => expect(row.networkCount, row.id).toBe(1));
  });
});
