import { api as apiSora, FPNumber, connection as soraConnection } from '@sora-substrate/util';
import type { ApiInterfaceEvents } from '@polkadot/api/types';
import type { ProviderInterfaceEmitCb } from '@polkadot/rpc-provider/types';
import type { SoraFees } from '@/interfaces';
import type State from '@extension-base/background/handlers/State';
import { AUTO_CONNECT_MS } from '@/consts/networks';

export class SoraApiHandler {
  static initApi(currentProvider: string, eventListeners: [ApiInterfaceEvents, ProviderInterfaceEmitCb][]) {
    void soraConnection.open(currentProvider, {
      autoConnectMs: AUTO_CONNECT_MS,
      eventListeners,
    }).catch((error) => console.warn('SORA connection unavailable', error));
    // The SDK waits on isReady by default; its separate rejectable readiness promise still needs an owner.
    void soraConnection.api?.isReadyOrError.catch((error) => console.warn('SORA connection not ready', error));
  }

  static getApiInstance() {
    return soraConnection.api!;
  }

  static async initialize(state: State) {
    await apiSora.initialize(false);
    await apiSora.calcStaticNetworkFees();

    const fees = Object.fromEntries(
      Object.entries(apiSora.NetworkFee).map(([operation, value]) => [
        operation,
        FPNumber.fromCodecValue(value).toString(),
      ])
    ) as SoraFees;

    state.soraFees.next(fees);
  }
}
