import { storage } from '@extension-base/stores/Storage';
import { axios } from '@extension-base/utils/axios';
import type { UserType } from './types';
import type { OnBoardingStoriesLocales, OnboardingStories } from '@/interfaces';
import { IS_PRODUCTION } from '@/consts/global';
import { URLS } from '@/consts/urls';

export class OnboardingService {
  private userType: UserType = 'new';
  public isRequired = false;
  public seen = false;
  private defaultLocale = 'en-EN';
  private stories: OnBoardingStoriesLocales = {};

  get user() {
    return this.userType;
  }

  async init(): Promise<void> {
    const { onboarding } = await storage.get(['onboarding']);

    if (onboarding) {
      this.isRequired = onboarding.isRequired;
      this.changeUserType(onboarding.user);
    }

    const res = await axios.get<OnBoardingStoriesLocales>(URLS.ONBOARDING_URL).catch(() => {
      console.info('onboarding fetch error');
    });

    if (res && res.status === 200) this.stories = res.data;
    else {
      this.isRequired = false;
      this.updateStorage();

      return;
    }

    const userStories = this.stories[this.defaultLocale][this.userType];

    if (userStories.length && IS_PRODUCTION) this.isRequired = true;
    this.updateStorage();
  }

  getStories(lang: string): OnboardingStories {
    if (!IS_PRODUCTION) return [];

    const localizeStories = this.stories[lang] ?? this.stories[this.defaultLocale];

    return localizeStories[this.userType];
  }

  changeUserType(type: UserType) {
    this.userType = type;

    this.updateStorage();
  }

  updateStorage() {
    storage.set({ onboarding: { user: this.userType, isRequired: this.isRequired, seen: this.seen } });
  }

  setSeen() {
    this.isRequired = false;
    this.seen = true;

    this.updateStorage();
  }
}
