import type { CheckNFTTx, NftSettings, NftState, NftTx } from '@extension-base/services/nft-service/types';
import { sendMessage } from '@/extension/messaging';

export function getNftSubscribe(cb: (data: NftState) => void): Promise<NftState> {
  return sendMessage('pri(nft.subscribe)', null, cb);
}

export function sendNft(tx: NftTx): Promise<boolean> {
  return sendMessage('pri(nft.send)', tx);
}

export function checkNft(tx: NftTx): Promise<CheckNFTTx> {
  return sendMessage('pri(nft.checkSend)', tx);
}

export function changeNftSettings(settings: NftSettings): Promise<void> {
  return sendMessage('pri(nft.settings)', settings);
}
