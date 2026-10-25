import type { ApiInterfaceEvents } from '@polkadot/api/types';
import type { ProviderInterfaceEmitCb } from '@polkadot/rpc-provider/types';
import type { SoraFees } from '@/interfaces';
import type State from '@extension-base/background/handlers/State';
import { FPNumber } from '@/sora/number';
import { SoraClient, createConnection, api as apiSora } from '@/sora/client';
import { AUTO_CONNECT_MS } from '@/consts/networks';

type Listeners = [ApiInterfaceEvents, ProviderInterfaceEmitCb][];
type Connection = ReturnType<typeof createConnection>;

export class SoraApiHandler {
  private static current?: { connection: Connection; listeners: Listeners };

  static initApi(currentProvider: string, eventListeners: Listeners) {
    const previous = this.current;
    const connection = createConnection(currentProvider, { autoConnectMs: AUTO_CONNECT_MS, eventListeners });
    this.current = { connection, listeners: eventListeners };
    apiSora.api = connection.api;
    apiSora.provider = connection.provider;
    // Invalidate old quotes/fees while the replacement node initializes.
    apiSora.dex = { baseAssetsIds: [], ids: new Map() };
    apiSora.NetworkFee = {};
    if (previous) {
      const oldApi = previous.connection.api;
      previous.listeners.forEach(([event, callback]) => oldApi.off(event, callback));
      void oldApi.disconnect().catch((error) => console.warn('Previous SORA connection could not close', error));
    }
    void connection.api.isReadyOrError.catch((error) => console.warn('SORA connection not ready', error));
  }

  static getApiInstance() {
    return this.current?.connection.api;
  }

  static async initialize(state: State, ownsReady: () => boolean = () => true) {
    const attempt = this.current;
    const capturedApi = attempt?.connection.api;
    const ownsConnection = () => !!capturedApi && this.current === attempt &&
      apiSora.api === capturedApi && ownsReady();
    if (!attempt || !ownsConnection()) return;

    // Read into an isolated client. Only the current ready callback can publish
    // its DEX registry and fees after either asynchronous calculation completes.
    const candidate = new SoraClient();
    candidate.api = capturedApi;
    candidate.provider = attempt.connection.provider;
    await candidate.initialize(false);
    if (!ownsConnection()) return;
    await candidate.calcStaticNetworkFees();
    if (!ownsConnection()) return;
    const fees = Object.fromEntries(
      Object.entries(candidate.NetworkFee).map(([operation, value]) => [
        operation, FPNumber.fromCodecValue(value).toString(),
      ])
    ) as SoraFees;

    apiSora.dex = candidate.dex;
    apiSora.NetworkFee = candidate.NetworkFee;
    state.soraFees.next(fees);
  }
}
