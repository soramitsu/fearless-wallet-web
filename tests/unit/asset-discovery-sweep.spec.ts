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
    expect(state).toContain('if (this.ready) void this.runAssetDiscovery();');
    // The sweep keeps the worker's connections while it runs (WorkerSleepService).
    expect(state).toContain('return this.assetDiscoverySweepService.runIfDue(options).finally(release);');
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

  it('reads every network no wallet has been read on in one sweep, a few at a time, the most used first', async () => {
    let persisted: AssetDiscoverySweepState | undefined;
    let activeScans = 0;
    let maxActiveScans = 0;
    const started: string[] = [];
    const registry = [
      network('Inactive unranked', '01'),
      network('Active ranked', '02', { active: true, rank: 1 }),
      network('Another inactive', '03'),
      network('Dev testnet', '04', { active: true, testnet: true }),
      network('Fifth', '05'),
    ];
    const service = new AssetDiscoverySweepService({
      concurrency: 2,
      getRegistryNetworks: () => registry,
      getWalletKeys: () => ['wallet-1'],
      maxNetworksPerRun: 1,
      now: () => 100_000,
      readState: async () => persisted,
      scanNetwork: async ({ name }) => {
        started.push(name);
        activeScans += 1;
        maxActiveScans = Math.max(maxActiveScans, activeScans);
        await Promise.resolve();
        activeScans -= 1;
      },
      writeState: async (value) => {
        persisted = value;
      },
    });

    const result = await service.runIfDue();

    // A first read is not limited to maxNetworksPerRun: a new wallet's holdings are found in one sweep, not in days.
    expect(result).toMatchObject({ due: true, failed: [] });
    expect([...result.scanned].sort()).toEqual(['Active ranked', 'Another inactive', 'Fifth', 'Inactive unranked']);
    expect(started[0]).toBe('Active ranked');
    expect(maxActiveScans).toBeLessThanOrEqual(2);
    expect(registry.map(({ active }) => active)).toEqual([false, true, false, true, false]);
    expect(Object.keys(persisted?.scannedAt ?? {}).sort()).toEqual(['substrate:01', 'substrate:02', 'substrate:03', 'substrate:05']);
    expect(persisted?.wallets).toEqual(['wallet-1']);
  });

  it('then reads again, once a day, the networks that were read longest ago', async () => {
    let persisted: AssetDiscoverySweepState | undefined;
    let clock = 100_000;
    const registry = [network('A', '01'), network('B', '02'), network('C', '03')];
    const scanNetwork = vi.fn(async (_network: NetworkJson) => {
      clock += 1;
    });
    const service = new AssetDiscoverySweepService({
      getRegistryNetworks: () => registry,
      getWalletKeys: () => ['wallet-1'],
      intervalMs: 20_000,
      maxNetworksPerRun: 2,
      concurrency: 1,
      now: () => clock,
      readState: async () => persisted,
      scanNetwork,
      writeState: async (value) => {
        persisted = value;
      },
    });

    await service.runIfDue();
    expect(scanNetwork).toHaveBeenCalledTimes(3);

    // Everything has been read and a day has not passed: nothing to do.
    await expect(service.runIfDue()).resolves.toEqual({ due: false, scanned: [], failed: [], nextCursor: 0 });

    clock += 20_000;
    await expect(service.runIfDue()).resolves.toMatchObject({ due: true, scanned: ['A', 'B'] });
    clock += 20_000;
    // C was read longest ago now, then A.
    await expect(service.runIfDue()).resolves.toMatchObject({ due: true, scanned: ['C', 'A'] });
  });

  it('reads every network again for a wallet that was added, and a network whose assets changed', async () => {
    let persisted: AssetDiscoverySweepState | undefined;
    let wallets = ['wallet-1'];
    let registry = [network('A', '01'), network('B', '02')];
    const scanned: string[] = [];
    const service = new AssetDiscoverySweepService({
      getRegistryNetworks: () => registry,
      getWalletKeys: () => wallets,
      now: () => 100_000,
      readState: async () => persisted,
      scanNetwork: async ({ name }) => {
        scanned.push(name);
      },
      writeState: async (value) => {
        persisted = value;
      },
    });

    await service.runIfDue();
    scanned.length = 0;

    wallets = ['wallet-1', 'wallet-2'];
    await expect(service.runIfDue()).resolves.toMatchObject({ scanned: ['A', 'B'] });
    scanned.length = 0;

    // B lists one more asset: only B is read again.
    registry = [registry[0], { ...registry[1], assets: [{ id: 'new-token' }] } as unknown as NetworkJson];
    await expect(service.runIfDue()).resolves.toMatchObject({ scanned: ['B'] });

    // A wallet removed is no reason to read anything.
    scanned.length = 0;
    wallets = ['wallet-2'];
    await expect(service.runIfDue()).resolves.toMatchObject({ due: false, scanned: [] });
  });

  it('starts over once from a state written by a build that swept by position', async () => {
    const registry = [network('A', '01'), network('B', '02')];
    let persisted: AssetDiscoverySweepState | undefined = {
      cursor: 1,
      lastRun: 99_999,
      registryKeys: ['substrate:01', 'substrate:02'],
      registrySignature: getAssetDiscoveryRegistrySignature(registry),
    };
    const scanNetwork = vi.fn(async (_network: NetworkJson) => undefined);
    const service = new AssetDiscoverySweepService({
      getRegistryNetworks: () => registry,
      getWalletKeys: () => ['wallet-1'],
      intervalMs: 20_000,
      now: () => 100_000,
      readState: async () => persisted,
      scanNetwork,
      writeState: async (value) => {
        persisted = value;
      },
    });

    // Nothing in that state says which wallet was read where, so every network is read once, though it is not due.
    await expect(service.runIfDue()).resolves.toMatchObject({ scanned: ['A', 'B'] });
    // The position is kept for an older build that may read the state again.
    expect(persisted?.cursor).toBe(1);
  });

  it('tries a failed first read again an hour later, or at once on Refresh', async () => {
    let persisted: AssetDiscoverySweepState | undefined;
    let clock = 100_000;
    let failing = true;
    const registry = [network('Flaky', '01')];
    const service = new AssetDiscoverySweepService({
      getRegistryNetworks: () => registry,
      getWalletKeys: () => ['wallet-1'],
      firstReadRetryMs: 60_000,
      now: () => clock,
      readState: async () => persisted,
      scanNetwork: async () => {
        if (failing) throw new Error('node down');
      },
      writeState: async (value) => {
        persisted = value;
      },
    });

    await expect(service.runIfDue()).resolves.toMatchObject({ scanned: [], failed: ['Flaky'] });
    expect(service.getProgress()).toEqual({ total: 1, checked: 0, unreachable: 1, running: false });

    clock += 30_000;
    await expect(service.runIfDue()).resolves.toMatchObject({ scanned: [], failed: [] });

    await expect(service.runIfDue({ force: true })).resolves.toMatchObject({ failed: ['Flaky'] });

    failing = false;
    clock += 60_000;
    await expect(service.runIfDue()).resolves.toMatchObject({ scanned: ['Flaky'], failed: [] });
    expect(service.getProgress()).toEqual({ total: 1, checked: 1, unreachable: 0, running: false });
  });

  it('gives up on a network that does not answer, so the others are still read', async () => {
    vi.useFakeTimers();
    try {
      const registry = [network('Hanging', '01'), network('Fine', '02')];
      const service = new AssetDiscoverySweepService({
        concurrency: 1,
        getRegistryNetworks: () => registry,
        getWalletKeys: () => ['wallet-1'],
        now: () => 100_000,
        readState: async () => undefined,
        scanNetwork: ({ name }) => (name === 'Hanging' ? new Promise<void>(() => undefined) : Promise.resolve()),
        scanTimeoutMs: 5_000,
        writeState: async () => undefined,
      });

      const run = service.runIfDue();
      await vi.advanceTimersByTimeAsync(5_000);

      await expect(run).resolves.toMatchObject({ scanned: ['Fine'], failed: ['Hanging'] });
    } finally {
      vi.useRealTimers();
    }
  });

  it('runs one sweep at a time and says how far it is', async () => {
    let release!: () => void;
    const progress: unknown[] = [];
    const registry = [network('A', '01'), network('B', '02')];
    const scanNetwork = vi.fn(({ name }: NetworkJson) =>
      name === 'A' ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve()
    );
    const service = new AssetDiscoverySweepService({
      concurrency: 1,
      getRegistryNetworks: () => registry,
      getWalletKeys: () => ['wallet-1'],
      now: () => 100_000,
      onProgress: (value) => progress.push(value),
      readState: async () => undefined,
      scanNetwork,
      writeState: async () => undefined,
    });

    const first = service.runIfDue();
    const second = service.runIfDue({ force: true });

    expect(second).toBe(first);
    await vi.waitFor(() => expect(scanNetwork).toHaveBeenCalledOnce());
    expect(service.getProgress()).toEqual({ total: 2, checked: 0, unreachable: 0, running: true });

    release();
    await first;

    expect(scanNetwork).toHaveBeenCalledTimes(2);
    expect(progress).toEqual([
      { total: 2, checked: 0, unreachable: 0, running: true },
      { total: 2, checked: 1, unreachable: 0, running: true },
      { total: 2, checked: 2, unreachable: 0, running: false },
    ]);
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
    let persisted: AssetDiscoverySweepState | undefined;
    const scanNetwork = vi.fn(async (_network: NetworkJson) => undefined);
    const service = new AssetDiscoverySweepService({
      getRegistryNetworks: () => registry,
      getWalletKeys: () => ['wallet-1'],
      intervalMs: 20_000,
      now: () => 100_000,
      readState: async () => persisted,
      scanNetwork,
      writeState: async (value) => {
        persisted = value;
      },
    });

    await service.runIfDue();
    expect(scanNetwork.mock.calls.map(([item]) => item.name)).toEqual(['Production']);
    scanNetwork.mockClear();

    await expect(service.runIfDue()).resolves.toEqual({ due: false, scanned: [], failed: [], nextCursor: 0 });
    expect(scanNetwork).not.toHaveBeenCalled();

    await service.runIfDue({ force: true, includeTestnets: true });
    // The test network has never been read, so it comes first; the production one is read again.
    expect(scanNetwork.mock.calls.map(([item]) => item.name)).toEqual(['Taira testnet', 'Production']);
  });

  it('runs immediately on a registry change and reads only the newly added production network', async () => {
    const original = network('Original', '01');
    const added = network('New chain', '99');
    let registry = [original];
    let persisted: AssetDiscoverySweepState | undefined;
    const scanNetwork = vi.fn(async (_network: NetworkJson) => undefined);
    const service = new AssetDiscoverySweepService({
      getRegistryNetworks: () => registry,
      getWalletKeys: () => ['wallet-1'],
      intervalMs: 20_000,
      maxNetworksPerRun: 1,
      now: () => 100_000,
      readState: async () => persisted,
      scanNetwork,
      writeState: async (value) => {
        persisted = value;
      },
    });

    await service.runIfDue();
    await expect(service.runIfDue()).resolves.toMatchObject({ due: false });

    registry = [original, added];
    await expect(service.runIfDue()).resolves.toMatchObject({ due: true, scanned: ['New chain'] });
    expect(scanNetwork).toHaveBeenLastCalledWith(added);
  });
});
