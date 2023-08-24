import { storage } from '@extension-base/stores/Storage';
import { axios } from '../../utils';
import { FALLBACK_LANG, ONBOARDING_URL } from '../../const';
import type { UserType } from './types';
import type { OnBoardingStoriesLocales, OnboardingStories } from '@/interfaces';

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

    const res = await axios.get<OnBoardingStoriesLocales>(ONBOARDING_URL).catch(() => {
      console.info('onboarding fetch error');
    });

    if (res && res.status === 200) this.stories = res.data;
    else {
      this.isRequired = false;

      return;
    }

    const userStories = this.stories[this.defaultLocale][this.userType];

    if (userStories.length) this.isRequired = true;
  }

  getStories(lang: string): OnboardingStories {
    const localizeStories = this.stories[lang] ?? this.stories[FALLBACK_LANG];

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
