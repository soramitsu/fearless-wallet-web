import {
  TERMS_URL,
  PRIVACY_URL,
  FEARLESS_WALLET,
  GITHUB_URL,
  WIKI_URL,
  TELEGRAM_URL,
  MEDIUM_URL,
  INSTAGRAM_URL,
  TWITTER_URL,
  YOUTUBE_URL,
  ANNOUNCEMENTS_URL,
  FEARLESS_HAPPINESS_URL,
  EMAIL_URL,
} from '@/consts/urls';

const MAIN_ITEMS = [
  {
    icon: 'info.svg',
    label: 'Official Website',
    subLabel: 'fearlesswallet.io',
    url: FEARLESS_WALLET,
  },
  {
    icon: 'wiki.svg',
    label: 'Learn on Wiki',
    subLabel: 'wiki.fearlesswallet.io',
    url: WIKI_URL,
  },
  {
    icon: 'github.svg',
    label: 'Github Source Code',
    subLabel: 'App version 1.1.0',
    url: GITHUB_URL,
  },
  {
    icon: 'terms_conditions.svg',
    label: 'Terms and Conditions',
    url: TERMS_URL,
  },
  {
    icon: 'terms_conditions.svg',
    label: ' Privacy Policy',
    url: PRIVACY_URL,
  },
];

const COMMUNITY_ITEMS = [
  {
    icon: 'telegram.svg',
    label: 'Join on Telegram',
    subLabel: 't.me/fearlesswallet',
    url: TELEGRAM_URL,
  },
  {
    icon: 'medium.svg',
    label: 'Read on Medium',
    subLabel: 'medium.com/fearlesswallet',
    url: MEDIUM_URL,
  },
];

const SOCIAL_MEDIA_ITEMS = [
  {
    icon: 'instagram.svg',
    label: 'Like on Instagram',
    subLabel: 'instagram.com/fearless_wallet',
    url: INSTAGRAM_URL,
  },
  {
    icon: 'twitter.svg',
    label: 'Read on Twitter',
    subLabel: 'twitter.com/Soramitsu_co',
    url: TWITTER_URL,
  },
  {
    icon: 'youtube.svg',
    label: 'Subscribe on YouTube',
    subLabel: 'youtube.com/fearlesswallet',
    url: YOUTUBE_URL,
  },
  {
    icon: 'announcements.svg',
    label: 'Receive Announcements',
    subLabel: 't.me/fearless_announcements',
    url: ANNOUNCEMENTS_URL,
  },
];

const SUPPORT_ITEMS = [
  {
    icon: 'support.svg',
    label: 'Ask for Support',
    subLabel: 't.me/fearlesshappiness',
    url: FEARLESS_HAPPINESS_URL,
  },
  {
    icon: 'more.svg',
    label: 'Contact Email',
    subLabel: 'fearless@soramitsu.co.jp',
    url: EMAIL_URL,
  },
];

export { COMMUNITY_ITEMS, MAIN_ITEMS, SOCIAL_MEDIA_ITEMS, SUPPORT_ITEMS };
