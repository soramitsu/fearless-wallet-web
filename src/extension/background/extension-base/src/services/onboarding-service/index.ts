import { storage } from '@extension-base/stores/Storage';
import axios from 'axios';
import type { UserType } from './types';
import type { OnBoardingStoriesLocales, OnboardingStories } from '@/interfaces';
import { IS_PRODUCTION } from '@/consts/global';
import { URLS } from '@/consts/urls';

export class OnboardingService {
  private userType: UserType = 'new';
  public isRequired = false;
  private defaultLocale = 'en-EN';
  private stories: OnBoardingStoriesLocales = {};

  get user() {
    return this.userType;
  }

  async init(): Promise<void> {
    if (!IS_PRODUCTION) return;

    const { onboarding } = await storage.get(['onboarding']);

    if (onboarding) this.changeUserType(onboarding.user);

    const res = await axios
      .get<OnBoardingStoriesLocales>(URLS.ONBOARDING_URL)
      .catch(() => console.info('onboarding fetch error'));

    if (res?.status === 200) this.stories = res.data;

    const userStories = this.stories[this.defaultLocale]?.[this.userType];

    this.isRequired = onboarding ? onboarding.isRequired : userStories.length !== 0;

    this.updateStorage();
  }

  getStories(lang: string): OnboardingStories {
    const localizeStories = this.stories[lang] ?? this.stories[this.defaultLocale];

    return localizeStories?.[this.userType] ?? [];
  }

  changeUserType(type: UserType) {
    this.userType = type;
  }

  updateStorage() {
    storage.set({
      onboarding: {
        user: this.userType,
        isRequired: this.isRequired,
      },
    });
  }

  setSeen() {
    this.isRequired = false;

    this.changeUserType('regular');
    this.updateStorage();
  }
}
