import { ApiPromise, WsProvider } from '@polkadot/api';
import { options } from '@sora-substrate/api';
import { Connection } from '@sora-substrate/connection';
import { Api, api as apiSora, FPNumber } from '@sora-substrate/util';
import type { ApiInterfaceEvents } from '@polkadot/api/types';
import type { ProviderInterfaceEmitCb } from '@polkadot/rpc-provider/types';
import type { SoraFees } from '@/interfaces';
import type State from '@extension-base/background/handlers/State';
import { AUTO_CONNECT_MS } from '@/consts/networks';

type Listeners = [ApiInterfaceEvents, ProviderInterfaceEmitCb][];

export class SoraApiHandler {
  private static current?: { connection: Connection; listeners: Listeners };

  static initApi(currentProvider: string, eventListeners: Listeners) {
    const previous = this.current;
    // SDK open/close mutate their Connection after awaiting readiness. Each attempt owns one instance,
    // so an older failure or delayed cleanup cannot clear the new endpoint.
    const connection = new Connection(ApiPromise, WsProvider, options());
    this.current = { connection, listeners: eventListeners };
    apiSora.setConnection(connection);
    if (previous?.connection.api) {
      const oldApi = previous.connection.api;
      previous.listeners.forEach(([event, callback]) => oldApi.off(event, callback));
      // Connection.close waits for readiness; disconnect the captured API immediately even while offline.
      void oldApi.disconnect().catch((error) => console.warn('Previous SORA connection could not close', error));
    }
    void connection.open(currentProvider, {
      autoConnectMs: AUTO_CONNECT_MS,
      eventListeners,
    }).catch((error) => console.warn('SORA connection unavailable', error));
    void connection.api?.isReadyOrError.catch((error) => console.warn('SORA connection not ready', error));
  }

  static getApiInstance() {
    return this.current?.connection.api;
  }

  static async initialize(state: State, ownsReady: () => boolean = () => true) {
    const attempt = this.current;
    const capturedApi = attempt?.connection.api;
    const ownsConnection = () => !!capturedApi && this.current === attempt &&
      attempt.connection.api === capturedApi && ownsReady();
    if (!ownsConnection()) return;
    await apiSora.initialize(false);
    if (!ownsConnection()) return;

    // SDK fee calculation mutates NetworkFee after awaits. Calculate on a separate SDK object bound
    // to the captured connection, then publish only if that connection still owns this ready callback.
    const feeApi = new Api();
    feeApi.setConnection(attempt.connection);
    await feeApi.calcStaticNetworkFees();
    if (!ownsConnection()) return;
    const fees = Object.fromEntries(
      Object.entries(feeApi.NetworkFee).map(([operation, value]) => [
        operation,
        FPNumber.fromCodecValue(value).toString(),
      ])
    ) as SoraFees;

    Object.assign(apiSora.NetworkFee, feeApi.NetworkFee);
    state.soraFees.next(fees);
  }
}
