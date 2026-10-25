import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import {
  AssetDiscoverySweepService,
  canScanSubstrateBackedDiscoveryNetwork,
  getAssetDiscoveryRegistrySignature,
  resolveAssetDiscoveryEvmAddress,
  type AssetDiscoverySweepState,
} from '@extension-base/services/asset-discovery-service';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';
import { createAuthoritativeDiscoveryRegistryNetworks } from '@/util/universalWalletRegistryNetworks';

const network = (
  name: string,
  chainId: string,
  { active = false, testnet = false, rank }: { active?: boolean; testnet?: boolean; rank?: number } = {}
) =>
  ({
    active,
    assets: [],
    chainId,
    disabled: false,
    ecosystem: 'substrate',
    name,
    options: testnet ? ['testnet'] : [],
    rank,
  }) as unknown as NetworkJson;

describe('AssetDiscoverySweepService', () => {
  it('wires every authoritative in-session registry refresh into the due-aware sweep', () => {
    const networkService = readFileSync(
      resolve(__dirname, '../../src/extension/background/extension-base/src/services/network-service/index.ts'),
      'utf8'
    );
    const state = readFileSync(
      resolve(__dirname, '../../src/extension/background/extension-base/src/background/handlers/State.ts'),
      'utf8'
    );
    const catalogUpdate = networkService.indexOf('this.networksGithub = networks;');
    const notification = networkService.indexOf('this.onAuthoritativeRegistryUpdated();');

    expect(catalogUpdate).toBeGreaterThan(-1);
    expect(notification).toBeGreaterThan(catalogUpdate);
    expect(state).toContain('if (this.ready) void this.assetDiscoverySweepService.runIfDue();');
    expect(state).toContain('getRegistryNetworks: () => this.networkService.authoritativeDiscoveryNetworks');
    expect(networkService).toContain('createAuthoritativeDiscoveryRegistryNetworks(this.networksGithub)');
    expect(networkService).not.toContain('createAuthoritativeDiscoveryRegistryNetworks(this.networkValues)');
  });

  it('merges registry-only production ecosystems without admitting custom network-map entries', () => {
    const remotePolkadot = network('Polkadot', 'polkadot');
    const registry = createAuthoritativeDiscoveryRegistryNetworks([remotePolkadot]);
    const identities = registry.map(({ ecosystem, chainId }) => `${ecosystem}:${chainId}`);

    expect(identities).toEqual(
      expect.arrayContaining([
        'substrate:polkadot',
        'ton:ton:mainnet',
        'solana:solana:mainnet',
        'bitcoin:bitcoin:mainnet',
        `iroha:${UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.chainId}`,
      ])
    );
    expect(registry.some(({ name }) => name === 'User custom chain')).toBe(false);
    expect(new Set(identities).size).toBe(identities.length);
  });

  it('uses a bounded cursor over the full production registry, including inactive unranked networks', async () => {
    let persisted: AssetDiscoverySweepState | undefined;
    let activeScans = 0;
    let maxActiveScans = 0;
    const scanned: string[] = [];
    const registry = [
      network('Inactive unranked', '01'),
      network('Active ranked', '02', { active: true, rank: 1 }),
      network('Another inactive', '03'),
      network('Dev testnet', '04', { active: true, testnet: true }),
    ];
    const service = new AssetDiscoverySweepService({
      concurrency: 2,
      getRegistryNetworks: () => registry,
      maxNetworksPerRun: 2,
      now: () => 100_000,
      readState: async () => persisted,
      scanNetwork: async ({ name }) => {
        activeScans += 1;
        maxActiveScans = Math.max(maxActiveScans, activeScans);
        await Promise.resolve();
        scanned.push(name);
        activeScans -= 1;
      },
      writeState: async (value) => {
        persisted = value;
      },
    });

    await expect(service.runIfDue()).resolves.toMatchObject({ due: true, nextCursor: 2 });
    expect(scanned).toEqual(['Inactive unranked', 'Active ranked']);
    expect(maxActiveScans).toBeLessThanOrEqual(2);
    expect(registry.map(({ active }) => active)).toEqual([false, true, false, true]);
  });

  it('scans disabled-by-default production Iroha because activation is presentation-only', async () => {
    let persisted: AssetDiscoverySweepState | undefined;
    const nexus = {
      ...network('SORA Nexus', UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.chainId),
      disabled: true,
      ecosystem: 'iroha',
    } as NetworkJson;
    const scanNetwork = vi.fn(async (_network: NetworkJson) => undefined);
    const service = new AssetDiscoverySweepService({
      getRegistryNetworks: () => [nexus],
      now: () => 100_000,
      readState: async () => persisted,
      scanNetwork,
      writeState: async (value) => {
        persisted = value;
      },
    });

    await expect(service.runIfDue()).resolves.toMatchObject({ scanned: ['SORA Nexus'], failed: [] });
    expect(scanNetwork).toHaveBeenCalledWith(nexus);
  });

  it('routes an EVM-only identity into ethereumBased discovery with its exact EVM address', () => {
    const evmAddress = '0x1111111111111111111111111111111111111111';
    const resolved = resolveAssetDiscoveryEvmAddress({
      primaryAddress: evmAddress,
      primaryEcosystem: WalletEcosystem.Evm,
      publicAccounts: [],
    });

    expect(resolved).toBe(evmAddress);
    expect(canScanSubstrateBackedDiscoveryNetwork('ethereumBased', false, resolved)).toBe(true);
    expect(canScanSubstrateBackedDiscoveryNetwork('substrate', false, resolved)).toBe(false);
  });

  it('skips a not-due sweep and includes testnets only with explicit opt-in', async () => {
    const registry = [network('Production', '01'), network('Taira testnet', '02', { testnet: true })];
    let persisted: AssetDiscoverySweepState | undefined = {
      cursor: 0,
      lastRun: 90_000,
      registryKeys: ['substrate:01'],
      registrySignature: getAssetDiscoveryRegistrySignature([registry[0]]),
    };
    const scanNetwork = vi.fn(async (_network: NetworkJson) => undefined);
    const service = new AssetDiscoverySweepService({
      getRegistryNetworks: () => registry,
      intervalMs: 20_000,
      now: () => 100_000,
      readState: async () => persisted,
      scanNetwork,
      writeState: async (value) => {
        persisted = value;
      },
    });

    await expect(service.runIfDue()).resolves.toEqual({ due: false, scanned: [], failed: [], nextCursor: 0 });
    expect(scanNetwork).not.toHaveBeenCalled();

    await service.runIfDue({ force: true, includeTestnets: true });
    expect(scanNetwork.mock.calls.map(([item]) => item.name)).toEqual(['Taira testnet', 'Production']);
  });

  it('runs immediately on a registry change and prioritizes newly added production networks', async () => {
    const original = network('Original', '01');
    const added = network('New chain', '99');
    let registry = [original];
    let persisted: AssetDiscoverySweepState | undefined = {
      cursor: 0,
      lastRun: 99_999,
      registryKeys: ['substrate:01'],
      registrySignature: getAssetDiscoveryRegistrySignature(registry),
    };
    const scanNetwork = vi.fn(async (_network: NetworkJson) => undefined);
    const service = new AssetDiscoverySweepService({
      getRegistryNetworks: () => registry,
      intervalMs: 20_000,
      maxNetworksPerRun: 1,
      now: () => 100_000,
      readState: async () => persisted,
      scanNetwork,
      writeState: async (value) => {
        persisted = value;
      },
    });

    await expect(service.runIfDue()).resolves.toMatchObject({ due: false });

    registry = [original, added];
    await expect(service.runIfDue()).resolves.toMatchObject({ due: true, scanned: ['New chain'] });
  });
});
