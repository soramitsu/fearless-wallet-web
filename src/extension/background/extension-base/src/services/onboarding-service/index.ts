import { storage } from '@extension-base/stores/Storage';
import { onboardingMocks } from './mocks';
import type { GetStoriesResponse, UserType } from './types';
import type { OnBoardingStoriesLocales } from '@/interfaces';

export default class OnboardingService {
  private userType: UserType = 'new';
  public isOnboardingRequired = false;
  private stories: OnBoardingStoriesLocales = {};
  private appVersion: string;

  constructor() {
    this.appVersion = chrome.runtime.getManifest().version;
  }

  get user() {
    return this.userType;
  }

  async init(): Promise<void> {
    const { appVersion, stories } = onboardingMocks;

    this.isOnboardingRequired = appVersion === this.appVersion;

    this.stories = stories;
  }

  getStories(): GetStoriesResponse {
    return {
      user: this.userType,
      stories: this.stories,
    };
  }

  changeUserType(type: UserType) {
    this.userType = type;

    storage.set({ userType: type });
  }
}
