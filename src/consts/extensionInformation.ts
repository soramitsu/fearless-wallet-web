import URLS from '@/consts/urls';

const MAIN_ITEMS = [
  {
    icon: 'info',
    label: 'Official Website',
    subLabel: 'fearlesswallet.io',
    url: URLS.FEARLESS_WALLET,
  },
  {
    icon: 'wiki',
    label: 'Learn on Wiki',
    subLabel: 'wiki.fearlesswallet.io',
    url: URLS.WIKI,
  },
  {
    icon: 'github',
    label: 'Github Source Code',
    subLabel: 'App version 1.1.0',
    url: URLS.GITHUB,
  },
  {
    icon: 'terms_conditions',
    label: 'Terms and Conditions',
    url: URLS.TERMS,
  },
  {
    icon: 'terms_conditions',
    label: ' Privacy Policy',
    url: URLS.PRIVACY,
  },
];

const COMMUNITY_ITEMS = [
  {
    icon: 'telegram',
    label: 'Join on Telegram',
    subLabel: 't.me/fearlesswallet',
    url: URLS.TELEGRAM,
  },
  {
    icon: 'medium',
    label: 'Read on Medium',
    subLabel: 'medium.com/fearlesswallet',
    url: URLS.MEDIUM,
  },
];

const SOCIAL_MEDIA_ITEMS = [
  {
    icon: 'instagram',
    label: 'Like on Instagram',
    subLabel: 'instagram.com/fearless_wallet',
    url: URLS.INSTAGRAM,
  },
  {
    icon: 'twitter',
    label: 'Read on Twitter',
    subLabel: 'twitter.com/Soramitsu_co',
    url: URLS.TWITTER,
  },
  {
    icon: 'youtube',
    label: 'Subscribe on YouTube',
    subLabel: 'youtube.com/fearlesswallet',
    url: URLS.YOUTUBE,
  },
  {
    icon: 'announcements',
    label: 'Receive Announcements',
    subLabel: 't.me/fearless_announcements',
    url: URLS.ANNOUNCEMENTS,
  },
];

const SUPPORT_ITEMS = [
  {
    icon: 'support',
    label: 'Ask for Support',
    subLabel: 't.me/fearlesshappiness',
    url: URLS.FEARLESS_HAPPINESS,
  },
  {
    icon: 'more',
    label: 'Contact Email',
    subLabel: 'fearless@soramitsu.co.jp',
    url: URLS.EMAIL,
  },
];

const EXTENSION_HEIGHT = 600;

export { COMMUNITY_ITEMS, MAIN_ITEMS, SOCIAL_MEDIA_ITEMS, SUPPORT_ITEMS, EXTENSION_HEIGHT };
