import { api as apiSora, FPNumber, connection as soraConnection } from '@sora-substrate/util';
import type { ApiInterfaceEvents } from '@polkadot/api/types';
import type { ProviderInterfaceEmitCb } from '@polkadot/rpc-provider/types';
import type { SoraFees } from '@/interfaces';
import type State from '@extension-base/background/handlers/State';
import { AUTO_CONNECT_MS } from '@/consts/networks';

export class SoraApiHandler {
  static async initApi(
    currentProvider: string,
    eventListeners: [ApiInterfaceEvents, ProviderInterfaceEmitCb][]
  ): Promise<void> {
    soraConnection.open(currentProvider, {
      autoConnectMs: AUTO_CONNECT_MS,
      eventListeners,
    });
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

    // Needed for Sora card, now not use
    // this.subscribeTotalXorBalance(state);
  }

  static subscribeTotalXorBalance(state: State) {
    if (!apiSora.api || !apiSora.api.isConnected) return;

    try {
      const subscription = apiSora.assets
        .getTotalXorBalanceObservable()
        .subscribe((xorTotalBalance: FPNumber) => state.balanceService.updateXorTotalBalance(xorTotalBalance));

      state.subscriptionService.updateNetworkSubscription({ name: 'xorTotalBalance', func: subscription.unsubscribe });
    } catch (ex) {
      console.error('failed subscribe or unsubscribe to XOR balance');
    }
  }
}
