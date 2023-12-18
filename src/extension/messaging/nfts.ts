import type { NftState } from '@extension-base/services/nft-service/types';
import { sendMessage } from '@/extension/messaging';

export function getNftSubscribe(cb: (data: NftState) => void): Promise<NftState> {
  return sendMessage('pri(nft.subscribe)', null, cb);
}
