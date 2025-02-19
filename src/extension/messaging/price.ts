import { sendMessage } from '@/extension/messaging/index';
import { type FiatJson } from '@/interfaces';

export function getFiats(): Promise<FiatJson[]> {
  return sendMessage('pri(price.getFiats)');
}
