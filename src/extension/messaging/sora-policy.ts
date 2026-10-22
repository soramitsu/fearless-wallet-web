import type { SoraDisclaimerStatus } from '@/defi/soraDisclaimer';
import { sendMessage } from '@/extension/messaging/index';

export function getSoraDisclaimerStatus(): Promise<SoraDisclaimerStatus> {
  return sendMessage('pri(policy.soraDisclaimer.status)');
}

export function acceptSoraDisclaimer(version: number): Promise<SoraDisclaimerStatus> {
  return sendMessage('pri(policy.soraDisclaimer.accept)', { version });
}
