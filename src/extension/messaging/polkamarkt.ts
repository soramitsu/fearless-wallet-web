import type {
  PolkamarktMutationRequest,
  PolkamarktMutationResponse,
  PolkamarktQuote,
  PolkamarktQuoteRequest,
  PolkamarktSnapshot,
} from '@/defi/polkamarkt/types';
import { sendMessage } from '@/extension/messaging/index';

export function getPolkamarktSnapshot(marketId?: string): Promise<PolkamarktSnapshot> {
  return sendMessage('pri(defi.polkamarkt.snapshot)', { marketId });
}

export function getPolkamarktQuote(request: PolkamarktQuoteRequest): Promise<PolkamarktQuote> {
  return sendMessage('pri(defi.polkamarkt.quote)', request);
}

export function mutatePolkamarkt(request: PolkamarktMutationRequest): Promise<PolkamarktMutationResponse> {
  return sendMessage('pri(defi.polkamarkt.mutate)', request);
}
