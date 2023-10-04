import type { OnboardingStories } from '@/interfaces';
import { sendMessage } from '@/extension/messaging/index';

export function getOnboardingStories(lang: string): Promise<OnboardingStories> {
  return sendMessage('pri(onboarding.get.stories)', lang);
}

export function setOnboardingSeen(): Promise<void> {
  return sendMessage('pri(onboarding.seen)');
}

export function isOnboardingRequired(): Promise<boolean> {
  return sendMessage('pri(onboarding.isRequired)');
}
