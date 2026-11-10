import type { WcSessionRequestEvent } from '@extension-base/services/wallet-connect-service/protocol/types';
import type { WalletConnectService } from './index';

export function assertWalletConnectRequestActive(
  service: WalletConnectService,
  event: WcSessionRequestEvent
): void {
  const deadline = event.params.request.expiryTimestamp;
  if (
    (deadline !== undefined && (!Number.isSafeInteger(deadline) || deadline <= Date.now() / 1000)) ||
    service.isRequestExpired(event.id)
  )
    throw new Error('WalletConnect signing request has expired');
}
