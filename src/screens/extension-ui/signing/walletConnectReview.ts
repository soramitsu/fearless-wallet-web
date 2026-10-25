import { evmSigningAddress } from '@extension-base/services/request-service/handlers/evmSigningContext';
import { reviewJson, signingReview } from './review';
import type { EvmRequestPayload } from '@extension-base/services/request-service/types';
import type { WalletConnectTransactionRequest } from '@extension-base/services/wallet-connect-service/types';

// Display admission context, never the currently selected wallet/network.
// The worker independently revalidates the live session before approval.
export function walletConnectReview(value: WalletConnectTransactionRequest) {
  const context = value.context;
  const request: EvmRequestPayload = {
    id: value.approvalId,
    url: context?.session?.origin ?? value.verifyContext?.verified?.origin ?? '',
    method: value.params?.request?.method ?? '',
    data: value.params?.request?.params,
    account: context?.account ?? { address: '', isMobile: false },
    network: context?.network ?? { name: '', chainId: '', genesisHash: '' },
  };
  const review = signingReview(request);
  review.raw = reviewJson(value.params);
  try {
    const origin = new URL(request.url);
    if (
      !context ||
      !value.approvalId ||
      context.account.isMobile ||
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.origin !== request.url ||
      context.session.topic !== value.topic ||
      !context.session.peerPublicKey ||
      !Number.isSafeInteger(context.session.revision) ||
      context.session.revision < 0 ||
      !/^[1-9][0-9]*$/.test(context.network.chainId) ||
      value.params.chainId !== `eip155:${context.network.chainId}` ||
      evmSigningAddress(request.method, request.data).toLowerCase() !== context.account.address.toLowerCase()
    )
      throw new Error('Unqualified WalletConnect review context');
  } catch {
    review.blocked = true;
    review.blind = true;
  }
  return { request, review };
}
