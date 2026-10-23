import type { OnBoardingStoriesLocales } from '@/interfaces';

const newStoryImage = (index: number) =>
  `https://raw.githubusercontent.com/soramitsu/shared-features-utils/develop-free/appConfigs/onboarding/screensWeb/${index}.svg`;
const regularStoryImage = (index: number) =>
  `https://raw.githubusercontent.com/soramitsu/shared-features-utils/develop-free/appConfigs/onboarding/screensWeb_v2/${index}.svg`;

export const egyptianOnboardingStories: OnBoardingStoriesLocales[string] = {
  new: [
    {
      title: '𓇋𓅓𓇌𓂋 𓅓𓄿𓅱 𓈖 𓄡𓈖𓅓𓏥',
      description: '𓈙𓅓𓋴 𓅓𓅓𓇌𓏥 𓄡𓈖𓅓𓏥 𓈖𓃀, 𓄡𓈖𓅓𓏥 𓅓𓂋𓇌 𓈖 𓂋𓅓𓏏𓏥 𓂝𓈙𓄿, 𓎛𓈖𓂝 𓄡𓈖𓅓𓏥𓎡',
      image: newStoryImage(1),
    },
    {
      title: '𓄡𓈖𓅓𓏥 𓅓𓂋𓇌𓏥𓎡',
      description: '𓋴𓏏𓊪 𓄡𓈖𓅓𓏥 𓅓𓂋𓇌𓎡; 𓇋𓂋𓇋 𓇋𓂋𓏏𓎡 𓇋𓅓𓏥',
      image: newStoryImage(2),
    },
    {
      title: '𓋴𓅓𓈖 𓇋𓊪𓏥 𓈖 𓂋𓈖 𓏤 𓇋𓅱𓏏𓇌 𓂝𓈙𓄿',
      description: '𓂋𓐍𓎡 𓇋𓈖𓇋 𓇋𓊪𓏥 𓈖 𓂋𓈖 𓏤 𓇋𓅱𓏏𓇌 𓂝𓈙𓄿 𓂋 𓋴𓄿𓅱 𓐍𓏏𓏥𓎡',
      image: newStoryImage(3),
    },
    {
      title: '𓁹 𓐍𓏏𓏥 𓅓 𓄡𓈖𓅓𓏥 𓂝𓈙𓄿',
      description: '𓁹 𓐍𓏏𓏥 𓅓𓂋𓇌𓏥𓎡 𓎛𓈖𓂝 𓇋𓊪𓏥𓋴𓈖 𓅓 𓄡𓈖𓅓𓏥 𓂝𓈙𓄿 𓅓 𓋴𓏏 𓏤',
      image: newStoryImage(4),
    },
    {
      title: '𓋴𓄿𓅱 𓐍𓏏𓏥 𓈖 𓋴𓈖𓆓 𓅓 𓄡𓈖𓅓𓏥',
      description: '𓇋𓈖𓇋 𓐍𓏏𓏥 𓅓 𓄡𓈖𓅓 𓋴𓏏𓊪; 𓇋𓂋𓇋 𓅓𓂋𓇌 𓈖 𓎛𓄿𓏏𓎡',
      image: newStoryImage(5),
    },
  ],
  regular: [
    {
      title: '𓇋𓅱𓏏𓎡 𓅓 𓋴𓄿𓅱 𓂝𓄿',
      description: '𓅓 𓂋𓈖 𓈙𓇾𓍔𓄿𓏴𓏛 𓂝𓄿 𓏤, 𓋴𓄿𓅱 𓉒𓏥𓎡, 𓇋𓂋𓏏𓏥𓎡, 𓎛𓈖𓂝 𓇋𓊪𓏥 𓈖 𓂋𓈖𓎡',
      image: regularStoryImage(1),
    },
    {
      title: '𓇋𓂋𓇋 𓂋𓈖 𓈙𓇾𓍔𓄿𓏴𓏛 𓂝𓄿',
      description: '𓇋𓂋𓇋 𓅓𓇋𓈖 𓂋𓈖 𓈙𓇾𓍔𓄿𓏴𓏛 𓂝𓄿; 𓋴𓄿𓅱 𓇋𓂋𓏏 𓊪𓈖',
      image: regularStoryImage(2),
    },
    {
      title: '𓇋𓈖𓇋 𓉒𓏥𓎡 𓂋 𓋴𓅓𓈖 𓅓𓄿𓅱',
      description: '𓂋𓂧𓇋 𓂋𓈖 𓈙𓇾𓍔𓄿𓏴𓏛 𓈖 𓉒𓏥𓎡 𓂋 𓋴𓅓𓈖𓋴𓈖 𓅓 𓂋𓈖 𓈙𓇾𓍔𓄿𓏴𓏛 𓂝𓄿; 𓇋𓅱𓏏𓇌 𓈙𓅓𓋴 𓅓 𓅱𓄿𓏏 𓊪𓈖',
      image: regularStoryImage(3),
    },
    {
      title: '𓐍𓏏 𓈖𓃀 𓅓 𓋴𓏏𓆑',
      description: '𓁹 𓅱𓄿𓏏 𓄤; 𓉒𓏥 𓅓𓐍𓏏𓏥 𓂋𓐍 𓂧𓇋 𓂋 𓋹 𓅓 𓂋𓂝 𓈖𓃀 𓅓 𓅓𓂧𓅱𓏥 𓈖 𓋴𓐍𓄿',
      image: regularStoryImage(4),
    },
  ],
};
