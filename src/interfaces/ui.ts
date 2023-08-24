export type Tab = {
  label: string;
  name: string;
};

export type OnboardingStory = {
  title: string;
  image: string;
  description: string;
};
export type OnboardingStories = OnboardingStory[];

type OnbordingType<T> = {
  new: T;
  regular: T;
};

export type OnBoardingStoriesLocales = {
  [key: string]: OnbordingType<OnboardingStories>;
};

export type OnboardingRequestResponse = OnBoardingStoriesLocales;
