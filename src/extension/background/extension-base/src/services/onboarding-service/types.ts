import { OnBoardingStoriesLocales } from '@/interfaces';

export type UserType = 'new' | 'regular';

export type GetStoriesResponse = {
  stories: OnBoardingStoriesLocales;
  user: UserType;
};
