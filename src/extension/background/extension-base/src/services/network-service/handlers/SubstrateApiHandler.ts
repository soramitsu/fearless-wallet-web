import { ApiPromise } from '@polkadot/api';
import { DOTSAMA_AUTO_CONNECT_MS } from '@extension-base/const/intervals';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { WsProvider } from '@polkadot/rpc-provider';
import {
  normalizeGenesisHash,
  substrateMetadataCache,
  substrateMetadataKey,
  type SubstrateMetadataCache,
} from '@extension-base/stores/SubstrateMetadataCache';
import { withDwellirApiKey } from '../nodeUrlPolicy';
import { SoraApiHandler } from './SoraApiHandler';
import type { HexString } from '@polkadot/util/types';
import type { ApiInterfaceEvents } from '@polkadot/api/types';
import type { ProviderInterfaceEmitCb } from '@polkadot/rpc-provider/types';
import type { NetworkService } from '@extension-base/services/network-service';
import type { NetworkJson } from '@extension-base/types';
import type { ApiProps } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import { type NetworkName } from '@/interfaces';
import { isSora } from '@/helpers';
import { MAX_CONTINUE_RETRY } from '@/consts/networks';

// The longest wait before connecting again to a network whose every node failed.
const RECONNECT_MAX_DELAY_MS = 120_000;
// A downloaded runtime is saved this long after its connection is ready, once its first balances have been asked for:
// encoding it again takes ~60 ms of the worker for a large chain.
export const METADATA_SAVE_DELAY_MS = 5_000;

/** The runtime metadata a connection was given, and the chain it belongs to. */
interface ConnectionRuntime {
  genesisHash: string;
  /** The `metadata` option of the connection's ApiPromise, filled in once the saved runtime has been read. */
  metadata: Record<string, HexString>;
  /** The key of the saved runtime it was given, if any. */
  supplied?: string;
  /** Set once the connection is ready: a read landing later is not kept in memory. */
  ready?: boolean;
}

/** @polkadot/api reports a runtime it could not set up (such as metadata that does not decode) with this error. */
function isInitializationError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Unable to initialize the API');
}

export class SubstrateApiHandler {
  api: Record<NetworkName, ApiProps> = {};
  private readonly connectionRevision: Record<NetworkName, number> = {};
  private readonly reconnectAttempts: Record<NetworkName, number> = {};
  private readonly runtimes = new WeakMap<ApiPromise, ConnectionRuntime>();

  constructor(
    readonly networkService: NetworkService,
    public state: State,
    readonly metadataCache: SubstrateMetadataCache = substrateMetadataCache
  ) {}

  async destroyApi(network: string) {
    const networkLower = network.toLowerCase();

    const entry = this.api[networkLower];
    if (!entry) return false;
    const { api, provider } = entry;
    const revision = this.connectionRevision[networkLower];

    entry.apiRetry = 0;

    await api?.disconnect();
    await provider?.disconnect();

    if (this.connectionRevision[networkLower] !== revision || this.api[networkLower] !== entry) return false;
    delete entry.api;
    delete entry.provider;
    return true;
  }

  /**
   * Closes every connection, SORA's included, as the wallet goes quiet. Pending reconnects and the closed connections'
   * events no longer count (connectionRevision), so nothing opens them again before initApi.
   */
  async destroyAll(): Promise<void> {
    const entries = Object.entries(this.api);

    for (const [key] of entries) {
      this.connectionRevision[key] = (this.connectionRevision[key] ?? 0) + 1;
      delete this.reconnectAttempts[key];
      delete this.api[key];
    }

    SoraApiHandler.disconnect();
    await Promise.allSettled(entries.map(async ([, { api, provider }]) => {
      await api?.disconnect();
      await provider?.disconnect();
    }));
  }

  refreshDotSamaApi(key: string) {
    const network = this.networkService.getNetworkJson(key);

    this.initApi(network);
  }

  createApiObject(): ApiProps {
    return {
      isEthereum: false,
      apiStatus: NETWORK_STATUS.CONNECTING,
      apiRetry: 0,
      nodeIndex: 0,
    };
  }

  getListeners(network: NetworkJson) {
    const { name, nodes } = network;
    const networkName = name.toLowerCase();
    const revision = this.connectionRevision[networkName];
    const ownsConnection = () => this.connectionRevision[networkName] === revision;

    if (this.api[networkName] === undefined) this.api[networkName] = this.createApiObject();
    const { nodeIndex } = this.api[networkName];

    const currentProvider = withDwellirApiKey(
      network.isManual ? network.currentProvider : nodes[nodeIndex]?.url ?? nodes[0].url,
      process.env.FL_WEB_DWELLIR_API_KEY || process.env.FL_DWELLIR_API_KEY || ''
    );

    const eventListeners: Array<[ApiInterfaceEvents, ProviderInterfaceEmitCb]> = [
      ['connected', () => { if (ownsConnection()) this.onConnected(networkName); }],
      ['disconnected', () => { if (ownsConnection()) void this.onDisconnected(name).catch(console.warn); }],
      ['ready', () => { if (ownsConnection()) void this.onReady(networkName).catch(console.warn); }],
      ['error', () => null],
    ];

    return {
      currentProvider,
      eventListeners,
    };
  }

  /**
   * Opens the network's connection, replacing any it had. The runtime metadata saved by an earlier connection is used
   * instead of downloading it again, unless `cachedMetadata` is false.
   */
  async initApi(network: NetworkJson, { cachedMetadata = true }: { cachedMetadata?: boolean } = {}) {
    const networkName = network.name.toLowerCase();
    this.connectionRevision[networkName] = (this.connectionRevision[networkName] ?? 0) + 1;

    const { currentProvider, eventListeners } = this.getListeners(network);
    this.api[networkName].apiStatus = NETWORK_STATUS.CONNECTING;
    this.api[networkName].apiRetry = 0;
    const genesisHash = cachedMetadata && this.metadataCache.enabled
      ? normalizeGenesisHash(network.genesisHash || network.chainId)
      : undefined;
    const metadata: Record<string, HexString> = {};

    if (isSora(networkName)) {
      // The SORA handler holds its connection itself; the network's entry gets it once connected (onConnected).
      SoraApiHandler.initApi(currentProvider, eventListeners, network.chainId, genesisHash ? metadata : undefined);
      const soraApi = SoraApiHandler.getApiInstance();
      if (genesisHash && soraApi) {
        this.supplyCachedMetadata(network, soraApi, { genesisHash, metadata }, () => SoraApiHandler.getApiInstance() === soraApi);
      }
      return;
    }

    // A replaced connection would stay open and keep reconnecting. Its events no longer count (connectionRevision).
    const { api: replacedApi, provider: replacedProvider } = this.api[networkName];
    const provider = new WsProvider(currentProvider, DOTSAMA_AUTO_CONNECT_MS, undefined, 10000);
    const api = new ApiPromise(genesisHash ? { provider, metadata, noInitWarn: true } : { provider, noInitWarn: true });
    this.api[networkName].api = api;
    this.api[networkName].provider = provider;
    void replacedApi?.disconnect().catch(console.warn);
    void replacedProvider?.disconnect().catch(console.warn);
    // ApiPromise rejects this even when no balance/signing caller is awaiting readiness yet.
    void api.isReadyOrError.catch((error) => {
      if (this.api[networkName]?.api !== api) return;
      this.api[networkName].apiStatus = NETWORK_STATUS.DISCONNECTED;
      console.warn('Substrate connection unavailable', networkName, error);
    });

    eventListeners.forEach(([eventName, callback]) => this.api[networkName].api?.on(eventName, callback));
    if (genesisHash) this.supplyCachedMetadata(network, api, { genesisHash, metadata }, () => this.api[networkName]?.api === api);
  }

  /**
   * Gives the connection the runtime saved for its chain. @polkadot/api looks the runtime up under
   * `${genesisHash}-${specVersion}` only after the node has answered its first calls, so the read, which started as the
   * socket opened, normally lands first; a later one is not used, and the runtime is downloaded as before. A chain whose
   * runtime was upgraded since has another key, so its new metadata is downloaded and saved in place of the old one.
   */
  private supplyCachedMetadata(network: NetworkJson, api: ApiPromise, runtime: ConnectionRuntime, isCurrent: () => boolean) {
    const networkName = network.name.toLowerCase();

    this.runtimes.set(api, runtime);
    void this.metadataCache.read(runtime.genesisHash).then((cached) => {
      if (!cached || runtime.ready || !isCurrent()) return;
      runtime.metadata[cached.key] = cached.hex;
      runtime.supplied = cached.key;
    });
    // A saved runtime the API cannot set up is removed, and the network connects again with the node's own metadata.
    api.on('error', (error: unknown) => {
      if (!runtime.supplied || !isInitializationError(error)) return;
      runtime.supplied = undefined;
      console.warn('[Metadata] Saved runtime metadata was not usable; connecting without it', networkName);
      void this.metadataCache.remove(runtime.genesisHash).then(() => {
        if (isCurrent()) void this.initApi(network, { cachedMetadata: false });
      });
    });
  }

  /**
   * Saves the runtime of a connection that has just become ready, unless it came from the saved one. The node's chain
   * must be the registry's: a node serving another chain has nothing to save under this network.
   */
  private saveRuntimeMetadata(api: ApiPromise | undefined) {
    const runtime = api && this.runtimes.get(api);

    if (!api || !runtime) return;
    // @polkadot/api reads the metadata option only until the API is ready: the hex need not stay in memory.
    runtime.ready = true;
    for (const key of Object.keys(runtime.metadata)) delete runtime.metadata[key];
    setTimeout(() => {
      try {
        // Read together: a runtime upgrade replaces the version and the metadata at the same moment.
        const genesisHash = api.genesisHash.toHex();
        const specVersion = api.runtimeVersion.specVersion.toNumber();

        if (genesisHash !== runtime.genesisHash || substrateMetadataKey(genesisHash, specVersion) === runtime.supplied) return;
        void this.metadataCache.write(genesisHash, specVersion, api.runtimeMetadata.toHex());
      } catch (error) {
        console.warn('[Metadata] Runtime metadata could not be saved', runtime.genesisHash, error);
      }
    }, METADATA_SAVE_DELAY_MS);
  }

  onConnected(networkName: NetworkName) {
    if (isSora(networkName)) this.api[networkName].api = SoraApiHandler.getApiInstance();

    this.api[networkName].apiRetry = 0;
    // A later outage starts again from the first node and the shortest wait.
    this.api[networkName].nodeIndex = 0;
    delete this.reconnectAttempts[networkName];
    this.api[networkName].apiStatus = NETWORK_STATUS.CONNECTED;
  }

  async onReady(networkName: NetworkName) {
    const revision = this.connectionRevision[networkName];
    const api = this.api[networkName]?.api;
    const ownsConnection = () => this.connectionRevision[networkName] === revision && this.api[networkName]?.api === api;
    if (isSora(networkName)) await SoraApiHandler.initialize(this.state, ownsConnection);
    if (!ownsConnection()) return;
    this.saveRuntimeMetadata(api);

    const account = this.state.currentAccount;

    if (!account) return;

    this.state.subscriptionService.subscribeSubstrateBalances({
      address: account.address,
      ethereumAddress: account.ethereumAddress,
      substrateNetworks: [networkName],
    });

    this.state.balanceService.updateUtilityED(networkName);
    this.state.balanceService
      .updateAssetMinimums(networkName)
      .catch((error: unknown) => console.warn(`[Balances] ${networkName}: asset minimums not read`, error));
  }

  async onDisconnected(networkName: NetworkName) {
    const api = this.api[networkName.toLowerCase()];
    const netName = this.networkService.getNetworkJson(networkName).name;
    const network = this.networkService.networkMap[netName];

    if (api === undefined) {
      this.state.subscriptionService.cancelNetworkSubscription(networkName);

      return;
    }

    // Offline every node fails. The provider keeps reconnecting by itself, so this failure is not held against the node.
    if (!navigator.onLine) return;

    api.apiRetry += 1;

    if (api.apiRetry < MAX_CONTINUE_RETRY) return;

    if (!await this.destroyApi(networkName)) return;

    api.nodeIndex += 1;

    if (api.nodeIndex <= network.nodes.length - 1) {
      this.initApi(network);
    } else {
      // Every node failed. The network stays active and connects again from the first node after a bounded backoff.
      api.apiStatus = NETWORK_STATUS.DISCONNECTED;
      api.nodeIndex = 0;
      this.reconnectLater(netName);
    }
  }

  private reconnectLater(name: string) {
    const networkName = name.toLowerCase();
    const revision = this.connectionRevision[networkName];
    const attempt = (this.reconnectAttempts[networkName] ?? 0) + 1;
    this.reconnectAttempts[networkName] = attempt;

    setTimeout(() => {
      // A newer connection, or the network being switched off, takes over.
      const network = this.networkService.networkMap[name];
      if (this.connectionRevision[networkName] !== revision || !network?.active) return;
      void this.initApi(network);
    }, Math.min(DOTSAMA_AUTO_CONNECT_MS * 2 ** (attempt - 1), RECONNECT_MAX_DELAY_MS));
  }
}
