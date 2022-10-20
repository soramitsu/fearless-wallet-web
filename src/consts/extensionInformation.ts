import URLS from '@/consts/urls';

const MAIN_ITEMS = [
  {
    icon: 'info.svg',
    label: 'Official Website',
    subLabel: 'fearlesswallet.io',
    url: URLS.FEARLESS_WALLET,
  },
  {
    icon: 'wiki.svg',
    label: 'Learn on Wiki',
    subLabel: 'wiki.fearlesswallet.io',
    url: URLS.WIKI,
  },
  {
    icon: 'github.svg',
    label: 'Github Source Code',
    subLabel: 'App version 1.1.0',
    url: URLS.GITHUB,
  },
  {
    icon: 'terms_conditions.svg',
    label: 'Terms and Conditions',
    url: URLS.TERMS,
  },
  {
    icon: 'terms_conditions.svg',
    label: ' Privacy Policy',
    url: URLS.PRIVACY,
  },
];

const COMMUNITY_ITEMS = [
  {
    icon: 'telegram.svg',
    label: 'Join on Telegram',
    subLabel: 't.me/fearlesswallet',
    url: URLS.TELEGRAM,
  },
  {
    icon: 'medium.svg',
    label: 'Read on Medium',
    subLabel: 'medium.com/fearlesswallet',
    url: URLS.MEDIUM,
  },
];

const SOCIAL_MEDIA_ITEMS = [
  {
    icon: 'instagram.svg',
    label: 'Like on Instagram',
    subLabel: 'instagram.com/fearless_wallet',
    url: URLS.INSTAGRAM,
  },
  {
    icon: 'twitter.svg',
    label: 'Read on Twitter',
    subLabel: 'twitter.com/Soramitsu_co',
    url: URLS.TWITTER,
  },
  {
    icon: 'youtube.svg',
    label: 'Subscribe on YouTube',
    subLabel: 'youtube.com/fearlesswallet',
    url: URLS.YOUTUBE,
  },
  {
    icon: 'announcements.svg',
    label: 'Receive Announcements',
    subLabel: 't.me/fearless_announcements',
    url: URLS.ANNOUNCEMENTS,
  },
];

const SUPPORT_ITEMS = [
  {
    icon: 'support.svg',
    label: 'Ask for Support',
    subLabel: 't.me/fearlesshappiness',
    url: URLS.FEARLESS_HAPPINESS,
  },
  {
    icon: 'more.svg',
    label: 'Contact Email',
    subLabel: 'fearless@soramitsu.co.jp',
    url: URLS.EMAIL,
  },
];

const EXTENSION_HEIGHT = 600;

export { COMMUNITY_ITEMS, MAIN_ITEMS, SOCIAL_MEDIA_ITEMS, SUPPORT_ITEMS, EXTENSION_HEIGHT };
