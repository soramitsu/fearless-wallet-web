import { sendMessage } from '@/extension/messaging/index';

export function getValidators(): Promise<any> {
  return sendMessage('pri(accounts.soraFees)');
}
