import pkg from '../../package.json';
import { URLS } from '@/consts/urls';

const MAIN_ITEMS = [
  {
    icon: 'info',
    label: 'officialWebsite',
    subLabel: 'fearlesswallet.io',
    url: URLS.FEARLESS_WALLET,
  },
  {
    icon: 'wiki',
    label: 'learnWiki',
    subLabel: 'wiki.fearlesswallet.io',
    url: URLS.WIKI,
  },
  {
    icon: 'github',
    label: 'githubCode',
    subLabel: `App version ${pkg.version}`,
    url: URLS.GITHUB,
  },
  {
    icon: 'terms_conditions',
    label: 'termsConditions',
    url: URLS.FEARLESS_TERMS,
  },
  {
    icon: 'terms_conditions',
    label: 'privacyPolicy',
    url: URLS.FEARLESS_PRIVACY,
  },
];

const COMMUNITY_ITEMS = [
  {
    icon: 'telegram',
    label: 'joinTelegram',
    subLabel: 't.me/fearlesswallet',
    url: URLS.TELEGRAM,
  },
  {
    icon: 'medium',
    label: 'readMedium',
    subLabel: 'medium.com/fearlesswallet',
    url: URLS.MEDIUM,
  },
];

const SOCIAL_MEDIA_ITEMS = [
  {
    icon: 'instagram',
    label: 'likeInstagram',
    subLabel: 'instagram.com/fearless_wallet',
    url: URLS.INSTAGRAM,
  },
  {
    icon: 'twitter',
    label: 'followTwitter',
    subLabel: 'twitter.com/fearlesswallet',
    url: URLS.TWITTER,
  },
  {
    icon: 'youtube',
    label: 'subscribeYouTube',
    subLabel: 'youtube.com/fearlesswallet',
    url: URLS.YOUTUBE,
  },
  {
    icon: 'announcements',
    label: 'receiveAnnouncements',
    subLabel: 't.me/fearless_announcements',
    url: URLS.ANNOUNCEMENTS,
  },
];

const SUPPORT_ITEMS = [
  {
    icon: 'support',
    label: 'askSupport',
    subLabel: 't.me/fearlesshappiness',
    url: URLS.FEARLESS_HAPPINESS,
  },
  {
    icon: 'more',
    label: 'contactEmail',
    subLabel: 'fearless@soramitsu.co.jp',
    url: URLS.EMAIL,
  },
];

export { COMMUNITY_ITEMS, MAIN_ITEMS, SOCIAL_MEDIA_ITEMS, SUPPORT_ITEMS };
