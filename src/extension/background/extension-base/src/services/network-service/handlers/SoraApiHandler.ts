import { getSoraConnection, getSoraUtil, getSoraUtilOrThrow } from '@extension-base/services/utils/sora';
import type { ApiInterfaceEvents } from '@polkadot/api/types';
import type { ProviderInterfaceEmitCb } from '@polkadot/rpc-provider/types';
import type { SoraFees } from '@/interfaces';
import type State from '@extension-base/background/handlers/State';
import { AUTO_CONNECT_MS } from '@/consts/networks';

export class SoraApiHandler {
  static async initApi(currentProvider: string, eventListeners: [ApiInterfaceEvents, ProviderInterfaceEmitCb][]) {
    const connection = await getSoraConnection();

    connection.open(currentProvider, {
      autoConnectMs: AUTO_CONNECT_MS,
      eventListeners,
    });
  }

  static getApiInstance() {
    const module = getSoraUtilOrThrow();

    return module.connection.api!;
  }

  static async initialize(state: State) {
    const { api: apiSora, FPNumber } = await getSoraUtil();

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
