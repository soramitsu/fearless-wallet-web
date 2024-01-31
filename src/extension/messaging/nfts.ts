import { type ResponseNftTransfer } from '@extension-base/background/types/types';
import type {
  AvailableNftPayload,
  AvailableNftResponse,
  CheckNftResponse,
  NftState,
  NftTx,
  RequestSettingsChangePayload,
} from '@extension-base/services/nft-service/types';
import { sendMessage } from '@/extension/messaging';

export function getNftSubscribe(cb: (data: NftState) => void): Promise<NftState> {
  return sendMessage('pri(nft.subscribe)', null, cb);
}

export function fetchNfts(address: string): Promise<void> {
  return sendMessage('pri(nft.fetch)', address);
}

export function sendNft(tx: NftTx): Promise<ResponseNftTransfer> {
  return sendMessage('pri(nft.send)', tx);
}

export function fetchAvailableNftsForContract(payload: AvailableNftPayload): Promise<AvailableNftResponse> {
  return sendMessage('pri(nft.fetchNftsForContract)', payload);
}

export function checkNft(tx: NftTx): Promise<CheckNftResponse> {
  return sendMessage('pri(nft.checkSend)', tx);
}

export function changeNftSettings(data: RequestSettingsChangePayload): Promise<void> {
  return sendMessage('pri(nft.settings)', data);
}
