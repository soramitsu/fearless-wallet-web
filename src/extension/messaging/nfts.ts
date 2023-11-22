import { type OwnedNftsResponse } from 'alchemy-sdk';
import { sendMessage } from '@/extension/messaging';

export function getNfts(address: string): Promise<OwnedNftsResponse> {
  return sendMessage('pri(nft.get.all)', address);
}
