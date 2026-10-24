import { TonApiClient, type TokenRates } from '@ton-api/client';
import { TiTonProvider } from './TiTonProvider';
import { RegistryNodeTonProvider, type TonApiClientLike } from './RegistryNodeTonProvider';
import {
  TonProviderError,
  type TonAccountBalance,
  type TonDataProvider,
  type TonHistoryEvent,
  type TonJettonScan,
  type TonNetworkKind,
} from './types';
import type { Address } from '@ton/core';
import type { NetworkJson } from '@extension-base/types';
import { UNIVERSAL_WALLET_TON_PROVIDER } from '@/consts/universalWallet';
import { isSameString } from '@/helpers';

type TonProviderNetwork = Pick<NetworkJson, 'name' | 'chainId' | 'nodes' | 'options'>;

type TonProviderOptions = {
  /** TI's base URL; TI is spoken to through its own routes only. */
  indexerUrl?: string;
  /** Use the registry's TON node while TI cannot prove it serves the network. */
  registryNodeFallback?: boolean;
  fetchFn?: (input: string, init?: RequestInit) => Promise<Response>;
  createTonApiClient?: (options: { baseUrl: string; apiKey?: string }) => TonApiClientLike;
  /** Sent to the registry node only, never to TI. */
  apiKey?: string;
  now?: () => number;
  logger?: Pick<Console, 'info' | 'warn'>;
};

// A verified choice is checked again after this long, so the wallet moves to TI as soon as TI proves the network.
const SELECTION_TTL_MS = 5 * 60_000;
// After nothing could be verified, the next attempt waits this long instead of asking on every request.
const FAILED_SELECTION_TTL_MS = 30_000;
// A verified TI that then fails a request is passed over for this long.
const TI_COOLDOWN_MS = 2 * 60_000;

/** The TON network a registry entry stands for. */
function tonNetworkKindOf({ name, chainId, options }: Pick<TonProviderNetwork, 'name' | 'chainId' | 'options'>): TonNetworkKind {
  const id = String(chainId ?? '').toLowerCase();

  if (id === '-3' || id === 'ton:testnet') return 'testnet';
  if (id === '-239' || id === 'ton:mainnet') return 'mainnet';

  return options?.some((option) => isSameString(option, 'testnet')) || /testnet/i.test(name) ? 'testnet' : 'mainnet';
}

/** The registry's own TON node: the first https node that is not TI (TI is never addressed as a TonAPI server). */
function registryNodeUrlOf(network: Pick<TonProviderNetwork, 'nodes'>, indexerUrl: string): string | undefined {
  const indexerHost = hostOf(indexerUrl);

  return (network.nodes ?? [])
    .map(({ url }) => url?.trim())
    .find((url): url is string => {
      if (!url) return false;

      try {
        const { protocol, hostname } = new URL(url);

        return protocol === 'https:' && hostname !== indexerHost;
      } catch {
        return false;
      }
    });
}

/**
 * The TON provider of one network. TI answers when it has proven, through its service-info, that it serves the
 * requested network, and every answer it gives is checked again. Otherwise the registry's TON node answers, once it
 * has proven the same; that fallback is logged each time it is chosen and can be switched off. With neither, every
 * request fails with `ton_provider_unavailable`, so callers show an error and never a made-up balance.
 */
class TonProviderRouter {
  readonly network: TonNetworkKind;
  readonly networkName: string;
  private readonly indexerUrl: string;
  private readonly registryNodeUrl?: string;
  private readonly registryNodeFallback: boolean;
  private readonly now: () => number;
  private readonly logger: Pick<Console, 'info' | 'warn'>;
  private selection?: { provider: Promise<TonDataProvider>; expiresAt: number };
  private registryNode?: { provider: Promise<RegistryNodeTonProvider>; expiresAt: number };
  private tiCooldown?: { until: number; reason: string };

  constructor(
    network: TonProviderNetwork,
    private readonly options: TonProviderOptions = {}
  ) {
    this.network = tonNetworkKindOf(network);
    this.networkName = network.name;
    this.indexerUrl = options.indexerUrl ?? UNIVERSAL_WALLET_TON_PROVIDER.indexerUrl;
    this.registryNodeUrl = registryNodeUrlOf(network, this.indexerUrl);
    this.registryNodeFallback = options.registryNodeFallback ?? UNIVERSAL_WALLET_TON_PROVIDER.registryNodeFallback;
    this.now = options.now ?? Date.now;
    this.logger = options.logger ?? console;
  }

  getAccountBalance(address: Address): Promise<TonAccountBalance> {
    return this.read((provider) => provider.getAccountBalance(address));
  }

  getJettonBalances(address: Address, currency: string): Promise<TonJettonScan> {
    return this.read((provider) => provider.getJettonBalances(address, currency));
  }

  getHistory(address: Address, limit: number): Promise<TonHistoryEvent[]> {
    return this.read((provider) => provider.getHistory(address, limit));
  }

  getRates(tokens: string[], currency: string): Promise<Record<string, TokenRates> | undefined> {
    return this.read((provider) => provider.getRates(tokens, currency));
  }

  /** The verified provider for reads right now. */
  provider(): Promise<TonDataProvider> {
    const now = this.now();

    if (!this.selection || this.selection.expiresAt <= now) {
      const provider = this.select();

      this.selection = { provider, expiresAt: now + SELECTION_TTL_MS };
      provider.catch(() => {
        if (this.selection?.provider === provider) this.selection.expiresAt = this.now() + FAILED_SELECTION_TTL_MS;
      });
    }

    return this.selection.provider;
  }

  /**
   * The verified provider a transfer reads its wallet state from and is sent through. TI only when its service-info
   * says it accepts transactions; otherwise the verified registry node, if the fallback is on.
   */
  async broadcaster(): Promise<TonDataProvider> {
    const provider = await this.provider();

    if (provider.canBroadcast) return provider;
    if (!this.registryNodeFallback) {
      throw new TonProviderError('ton_broadcast_unavailable', `${provider.baseUrl} does not accept transactions`);
    }

    return this.verifiedRegistryNode(`${provider.baseUrl} does not accept transactions`);
  }

  private async read<T>(request: (provider: TonDataProvider) => Promise<T>): Promise<T> {
    const provider = await this.provider();

    try {
      return await request(provider);
    } catch (error) {
      if (provider.source !== 'ti') throw error;

      // TI proved the network but did not answer properly: pass it over for a while and ask the registry node.
      this.tiCooldown = { until: this.now() + TI_COOLDOWN_MS, reason: describeError(error) };
      this.selection = undefined;

      if (!this.registryNodeFallback) throw error;

      return request(await this.provider());
    }
  }

  private async select(): Promise<TonDataProvider> {
    const tiProblem = await this.tiProblem();

    if (!tiProblem.provider) return this.verifiedRegistryNode(tiProblem.reason);

    this.logger.info(`[TON] ${this.networkName}: using ${tiProblem.provider.baseUrl} (verified ton:${this.network})`);

    return tiProblem.provider;
  }

  private async tiProblem(): Promise<{ provider: TiTonProvider; reason?: undefined } | { provider?: undefined; reason: string }> {
    if (this.tiCooldown && this.tiCooldown.until > this.now()) return { reason: `TI failed a request: ${this.tiCooldown.reason}` };

    try {
      const provider = new TiTonProvider(this.indexerUrl, this.network, this.options.fetchFn);

      await provider.verify();

      return { provider };
    } catch (error) {
      return { reason: describeError(error) };
    }
  }

  private verifiedRegistryNode(reason: string): Promise<RegistryNodeTonProvider> {
    if (!this.registryNodeFallback) {
      return Promise.reject(new TonProviderError('ton_provider_unavailable', `${reason}; the registry node fallback is off`));
    }
    if (!this.registryNodeUrl) {
      return Promise.reject(new TonProviderError('ton_provider_unavailable', `${reason}; the registry lists no TON node`));
    }

    const now = this.now();

    if (!this.registryNode || this.registryNode.expiresAt <= now) {
      const provider = this.createRegistryNode();

      this.registryNode = { provider, expiresAt: now + SELECTION_TTL_MS };
      provider.catch(() => {
        if (this.registryNode?.provider === provider) this.registryNode = undefined;
      });
    }

    return this.registryNode.provider.then(
      (provider) => {
        // Explicit and visible: the wallet is not on TI for this network, and why.
        this.logger.warn(
          `[TON] ${this.networkName}: using the registry node ${provider.baseUrl} instead of TI (${reason}). ` +
            'Fallback set by UNIVERSAL_WALLET_TON_PROVIDER.registryNodeFallback.'
        );

        return provider;
      },
      (error: unknown) => {
        throw new TonProviderError('ton_provider_unavailable', `${reason}; registry node: ${describeError(error)}`);
      }
    );
  }

  private async createRegistryNode(): Promise<RegistryNodeTonProvider> {
    const baseUrl = this.registryNodeUrl!;
    const createClient = this.options.createTonApiClient ?? ((options) => new TonApiClient(options));
    const provider = new RegistryNodeTonProvider(baseUrl, this.network, createClient({ baseUrl, apiKey: this.options.apiKey }));

    await provider.verify();

    return provider;
  }
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export {
  RegistryNodeTonProvider,
  TiTonProvider,
  TonProviderError,
  TonProviderRouter,
  registryNodeUrlOf,
  tonNetworkKindOf,
  type TonDataProvider,
  type TonHistoryEvent,
  type TonJettonScan,
  type TonNetworkKind,
  type TonProviderOptions,
};
