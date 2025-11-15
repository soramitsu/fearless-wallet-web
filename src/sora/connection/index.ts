import type { ApiPromise as ApiPromiseType } from '@polkadot/api';
import type { WsProvider as WsProviderType } from '@polkadot/rpc-provider';
import type { ApiInterfaceEvents, ApiOptions } from '@polkadot/api/types';
import type { ProviderInterfaceEmitCb } from '@polkadot/rpc-provider/types';

type ConnectionEventListener = [ApiInterfaceEvents, ProviderInterfaceEmitCb];

export interface ConnectionRunOptions {
  once?: boolean;
  timeout?: number;
  autoConnectMs?: number;
  eventListeners?: ConnectionEventListener[];
}

const disconnectApi = async (api: ApiPromiseType, eventListeners: ConnectionEventListener[]): Promise<void> => {
  if (!api) return;

  eventListeners.forEach(([eventName, eventHandler]) => api.off(eventName, eventHandler));

  try {
    await api.isReadyOrError;
  } catch {
    /* ignore */
  }

  try {
    if (api.isConnected) {
      await api.disconnect();
    }
  } catch (error) {
    console.error(error);
  }
};

const createConnectionTimeout = (timeout: number): Promise<void> => {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Connection Timeout')), timeout);
  });
};

class Connection {
  public api: ApiPromiseType | null = null;
  public endpoint = '';
  public loading = false;

  private readonly ApiPromise!: typeof ApiPromiseType;
  private readonly WsProvider!: typeof WsProviderType;
  private readonly apiOptions!: ApiOptions;

  private eventListeners: ConnectionEventListener[] = [];

  constructor(apiPromise: typeof ApiPromiseType, wsProvider: typeof WsProviderType, apiOptions: ApiOptions) {
    this.ApiPromise = apiPromise;
    this.WsProvider = wsProvider;
    this.apiOptions = apiOptions;
  }

  private async withLoading<T>(func: () => Promise<T>): Promise<T> {
    this.loading = true;
    try {
      return await func();
    } finally {
      this.loading = false;
    }
  }

  private async run(endpoint: string, runOptions?: ConnectionRunOptions): Promise<void> {
    const { once = false, timeout = 0, autoConnectMs = 5000, eventListeners = [] } = runOptions ?? {};
    const providerAutoConnectMs = once ? false : autoConnectMs;
    const apiConnectionPromise = once ? 'isReadyOrError' : 'isReady';

    const provider = new this.WsProvider(endpoint, providerAutoConnectMs);
    const api = new this.ApiPromise({ ...this.apiOptions, provider, noInitWarn: true });

    this.api = api;
    this.endpoint = endpoint;

    const readyPromise = apiConnectionPromise === 'isReady' ? api.isReady : api.isReadyOrError;

    const connectionRequests: Array<Promise<unknown>> = [readyPromise];

    if (timeout) connectionRequests.push(createConnectionTimeout(timeout));

    try {
      eventListeners.forEach(([eventName, eventHandler]) => {
        this.addEventListener(eventName, eventHandler);
      });

      if (!providerAutoConnectMs) {
        this.api.connect();
      }

      await Promise.race(connectionRequests);
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  private async stop(): Promise<void> {
    if (this.api) {
      await disconnectApi(this.api, this.eventListeners);
    }
    this.api = null;
    this.endpoint = '';
    this.eventListeners = [];
  }

  public addEventListener(eventName: ApiInterfaceEvents, eventHandler: ProviderInterfaceEmitCb) {
    this.api?.on(eventName, eventHandler);
    this.eventListeners.push([eventName, eventHandler]);
  }

  public get opened(): boolean {
    return !!this.api;
  }

  public async open(endpoint?: string, options?: ConnectionRunOptions): Promise<void> {
    if (!(endpoint || this.endpoint)) throw new Error('You should set endpoint for connection');
    await this.withLoading(async () => this.run(endpoint ?? this.endpoint, options));
  }

  public async close(): Promise<void> {
    await this.withLoading(async () => this.stop());
  }
}

export { Connection };
