import { storage } from '@extension-base/stores/Storage';
import { axios } from '../../utils';
import { ONBOARDING_URL } from '../../const';
import type { GetStoriesResponse, UserType } from './types';
import type { OnBoardingStoriesLocales } from '@/interfaces';

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

    const { data } = await axios.get<OnBoardingStoriesLocales>(ONBOARDING_URL);
    this.stories = data;

    const userStories = this.stories[this.defaultLocale][this.userType];

    if (userStories.length) this.isRequired = true;
  }

  getStories(): GetStoriesResponse {
    return {
      userType: this.userType,
      stories: this.stories,
    };
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
