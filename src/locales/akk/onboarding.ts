import type { OnBoardingStoriesLocales } from '@/interfaces';

const newStoryImage = (index: number) =>
  `https://raw.githubusercontent.com/soramitsu/shared-features-utils/develop-free/appConfigs/onboarding/screensWeb/${index}.svg`;
const regularStoryImage = (index: number) =>
  `https://raw.githubusercontent.com/soramitsu/shared-features-utils/develop-free/appConfigs/onboarding/screensWeb_v2/${index}.svg`;

export const akkadianOnboardingStories: OnBoardingStoriesLocales[string] = {
  new: [
    {
      title: '𒉺𒆠𒀉𒌅𒌝 𒌍𒊺𒌅𒌝 𒊭 𒊑𒅅𒊓𒋾𒅎',
      description:
        '𒁉𒊑𒀉 “𒊑𒅅𒊓𒌅𒌝 𒅗𒇻𒌑𒋗𒉡,” “𒊑𒅅𒊓𒌅𒌝 𒊭 𒉌𒅆 𒈠𒀪𒁺𒋾𒅎,” 𒌑 “𒊑𒅅𒊓𒌅𒌝 𒈾𒊒𒋾𒅗” 𒀀𒇷𒅅.',
      image: newStoryImage(1),
    },
    {
      title: '𒊑𒅅𒊓𒌅𒌝 𒊭 𒋫𒊏𒀀𒄠𒈠',
      description: '𒊑𒅅𒊓𒋾𒅎 𒊭 𒋫𒊏𒀀𒄠 𒅆𒅎𒈠 𒄿𒈾 𒋗𒉡𒋾𒈠 𒂊𒁍𒍑.',
      image: newStoryImage(2),
    },
    {
      title: '𒅆𒅎𒌅𒌝 𒊭 𒊑𒅅𒋛𒅎 𒅖𒋼𒂗 𒌑 𒇻 𒊑𒅅𒊓𒋾𒅎 𒈠𒁕𒋾𒅎',
      description: '𒊑𒅅𒊓𒄠 𒅖𒋼𒂗 𒌑 𒇻 𒁍𒄷𒌨 𒊑𒅅𒊓𒋾𒅎 𒇷𒆥𒂊𒅎 𒋼𒇷𒀪𒀪 𒀀𒈾 𒈠𒀝𒆪𒊑𒅗 𒉺𒋡𒁲𒅎.',
      image: newStoryImage(3),
    },
    {
      title: '𒋼𒅎 𒈠𒀝𒆪𒊑𒅎 𒄿𒈾 𒊑𒅅𒊓𒋾𒅎 𒈠𒁕𒋾𒅎',
      description: '𒈠𒀝𒆪𒊏𒄠 𒊭 𒋫𒊏𒀀𒄠 𒌑 𒉌𒅅𒅗𒊍𒋛𒋗 𒄿𒈾 𒊑𒅅𒊓𒋾𒅎 𒈠𒁕𒋾𒅎 𒄿𒈾 𒉺𒀭 𒅖𒋼𒂗 𒋫𒄠𒈬𒌨.',
      image: newStoryImage(4),
    },
    {
      title: '𒄿𒈾 𒆷 𒉺𒆷𒄭𒅎 𒈠𒀝𒆪𒊑 𒄿𒈾 𒊑𒅅𒊓𒋾𒅎 𒈠𒁕𒋾𒅎 𒉿𒆠𒀉',
      description: '𒈠𒀝𒆪𒊏𒄠 𒄿𒈾 𒊑𒅅𒋛𒅎 𒊭 𒋫𒊏𒀀𒄠 𒇷𒆥𒂊𒅎 𒌑 𒈪𒅎𒈠 𒊭 𒋫𒊏𒀀𒄠 𒂊𒁉𒊭𒄠 𒋼𒇷𒀪𒀪.',
      image: newStoryImage(5),
    },
  ],
  regular: [
    {
      title: '𒋗𒌌𒈬𒌝 𒀀𒈾 𒈠𒊍𒍝𒅈𒋾𒅎 𒊭𒇷𒅎𒋾𒅎',
      description: '𒄿𒈾 𒀀𒉿𒀜 𒉿𒊑𒅖𒋾𒅎 𒊏𒁉𒋾𒅎 𒅖𒋼𒋾𒅎 𒆠𒊓𒋾𒅗, 𒅁𒊭𒋾𒅗, 𒌑 𒌅𒌒𒉺𒀜 𒋗𒈪𒅗 𒉿𒆠𒀉.',
      image: regularStoryImage(1),
    },
    {
      title: '𒀀𒉿𒀜 𒉿𒊑𒅖𒋾𒅎 𒊏𒁉𒋾𒅎 𒋗𒆪𒌦',
      description: '𒄿𒈾𒀭𒈾 𒀀𒉿𒀜 𒉿𒊑𒅖𒋾𒅎 𒊏𒁉𒋾𒅎 𒂊𒁍𒍑𒈠 𒅁𒊭𒄠 𒌑𒍪𒌨.',
      image: regularStoryImage(2),
    },
    {
      title: '𒆠𒊓𒋾𒅗 𒀀𒈾 𒅆𒈠𒋾𒅎 𒌍𒊺𒋾𒅎 𒋗𒁉𒅋',
      description:
        '𒀀𒉿𒋾 𒉿𒊑𒅖𒋾𒅎 𒊭 𒆠𒊓𒋾𒅗 𒋗𒆪𒌦 𒀀𒈾 𒀀𒉿𒀜 𒉿𒊑𒅖𒋾𒅎 𒊏𒁉𒋾𒅎 𒅗𒍝𒊑𒅎; 𒌑 𒇻 𒀠𒅗𒋫𒄠 𒀭𒉌𒋾𒅎 𒂊𒋾𒅅.',
      image: regularStoryImage(3),
    },
    {
      title: '𒅗𒇻𒌑 𒊭𒀝𒉡𒌝!',
      description: '𒀀𒆷𒀝𒋫𒄠 𒁉𒅆𒋫𒄠 𒀀𒈬𒌨; 𒆠𒊓𒋾𒅎 𒊭 𒋼𒋾𒆪 𒄿𒈾 𒌝 𒈪𒅎𒈠 𒄿𒈾 𒀀𒉿𒀜 𒄩𒊓𒋛𒅎 𒋼𒅕.',
      image: regularStoryImage(4),
    },
  ],
};
