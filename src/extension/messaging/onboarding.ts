import type { OnboardingStories } from '@/interfaces';
import { sendMessage } from '@/extension/messaging/index';

export function getOnboardingStories(lang: string): Promise<OnboardingStories> {
  return sendMessage('pri(onboarding.getStories)', lang);
}

export function setOnboardingComplete(): Promise<void> {
  return sendMessage('pri(onboarding.setComplete)');
}

export function isOnboardingRequired(): Promise<boolean> {
  return sendMessage('pri(onboarding.isRequired)');
}
