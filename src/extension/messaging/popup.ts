import { sendMessage } from '@/extension/messaging';

export function getPopupIds(): Promise<number[]> {
  return sendMessage('pri(popup.getIds)', null);
}
