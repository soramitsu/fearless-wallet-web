import type { OnBoardingStoriesLocales } from '@/interfaces';

const newStoryImage = (index: number) =>
  `https://raw.githubusercontent.com/soramitsu/shared-features-utils/develop-free/appConfigs/onboarding/screensWeb/${index}.svg`;
const regularStoryImage = (index: number) =>
  `https://raw.githubusercontent.com/soramitsu/shared-features-utils/develop-free/appConfigs/onboarding/screensWeb_v2/${index}.svg`;

export const akkadianOnboardingStories: OnBoardingStoriesLocales[string] = {
  new: [
    {
      title: 'Paqittum eššetum ša riksātim',
      description:
        'Birīt “Riksātum kalûšunu,” “Riksātum ša nišī maʾdūtim,” u “Riksātum narūtīka” alik.',
      image: newStoryImage(1),
    },
    {
      title: 'Riksātum ša tarâm-ma',
      description: 'Riksātim ša tarâm šīm-ma ina šunūti-ma epūš.',
      image: newStoryImage(2),
    },
    {
      title: 'Šīmtum ša riksim ištēn u lū riksātim madātim',
      description: 'Riksam ištēn u lū puḫur riksātim leqêm teleʾʾi ana makkūrīka paqādim.',
      image: newStoryImage(3),
    },
    {
      title: 'Ṭēm makkūrim ina riksātim madātim',
      description: 'Makkūram ša tarâm u nikkassīšu ina riksātim madātim ina pān ištēn tammur.',
      image: newStoryImage(4),
    },
    {
      title: 'Ina lā palāḫim makkūrī ina riksātim madātim piqid',
      description: 'Makkūram ina riksim ša tarâm leqêm u mimma ša tarâm epēšam teleʾʾi.',
      image: newStoryImage(5),
    },
  ],
  regular: [
    {
      title: 'Šulmum ana maṣṣartim šalimtim',
      description: 'Ina awāt pirištim rabītim ištētim kīsātīka, epšātīka, u ṭuppāt šumīka piqid.',
      image: regularStoryImage(1),
    },
    {
      title: 'Awāt pirištim rabītim šukun',
      description: 'Inanna awāt pirištim rabītim epūš-ma epšam uṣur.',
      image: regularStoryImage(2),
    },
    {
      title: 'Kīsātīka ana šīmātim eššetim šūbil',
      description:
        'Awātī pirištim ša kīsātīka šukun ana awāt pirištim rabītim kaṣārim; u lū alkātam annītim eṭiq.',
      image: regularStoryImage(3),
    },
    {
      title: 'Kalû šaknum!',
      description: 'Alaktam pešītam amur; kīsātim ša teṭiqu ina ūm mimma ina awāt ḫasāsim tēr.',
      image: regularStoryImage(4),
    },
  ],
};
