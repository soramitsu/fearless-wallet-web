import type { AllowedPath, ActiveTabAuthorizeStatus } from '@extension-base/background/types/types';
import { sendMessage } from '@/extension/messaging/index';

export async function subscribeSoraCardToken(cb: (token: string) => void): Promise<boolean> {
  return sendMessage('pri(soraCard.token)', null, cb);
}

export function windowOpen(path: AllowedPath): Promise<boolean> {
  return sendMessage('pri(window.open)', path);
}

export function isTabAuthorize(): Promise<ActiveTabAuthorizeStatus> {
  return sendMessage('pri(tab.status)');
}

export function pingServiceWorker(): Promise<boolean> {
  return sendMessage('pri(app.port.ping)');
}
