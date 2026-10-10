import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APIItemState } from '@extension-base/api/types/networks';
import { getMockAssets } from '@extension-base/background/helpers/assets';
import { networkMap305, readSnapshot } from '../fixtures/legacy-305/generate';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { buildPortfolioSections, scopeNetworksToWallet } from '@/portfolio/assetIdentity';
import {
  CANONICAL_ASSET_GROUPS_SHA256,
  DEFAULT_VISIBLE_AT_ZERO,
  DEFAULT_VISIBLE_AT_ZERO_SHA256,
  TESTNET_CHAIN_IDS,
  TESTNET_CHAIN_IDS_SHA256,
  parseDefaultVisibleAtZero,
  parseTestnetChainIds,
} from '@/portfolio/canonicalGroups';
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
