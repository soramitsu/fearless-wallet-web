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

const WALLET_ICON =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAiIGhlaWdodD0iNTAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjUiIGN5PSIyNSIgcj0iMjQiIGZpbGw9InVybCgjcHJlZml4X19wcmVmaXhfX3BhaW50MF9hbmd1bGFyXzIxMjdfMTA1NTA2KSIvPjxnIGZpbHRlcj0idXJsKCNwcmVmaXhfX3ByZWZpeF9fZmlsdGVyMF9iXzIxMjdfMTA1NTA2KSI+PGNpcmNsZSBjeD0iMjUiIGN5PSIyNSIgcj0iMjQiIGZpbGw9IiMwMDAiIGZpbGwtb3BhY2l0eT0iLjEiLz48Y2lyY2xlIGN4PSIyNSIgY3k9IjI1IiByPSIyNC41IiBzdHJva2U9IiNmZmYiIHN0cm9rZS1vcGFjaXR5PSIuMSIvPjwvZz48cGF0aCBkPSJNNi44NDkgMjMuODk2bC0yLjU4Ni0yLjY1MWMtLjY4Ny0uNzA0LjA2OC0xLjcyMiAxLjE1OS0xLjU2MmwxNS4yMTUgMi4xOTVjLjM1NC4wNTIuNzE4LS4wMzUuOTgtLjIzNC40NjgtLjM1NC4yMDItLjk1LS4yNDgtMS4zMTlsLS4yNS0uMjA2Yy0uNDYzLS4zNzktLjYwMy0uOTg4LS4xNC0xLjM2OEwyNC40IDE1LjI5Yy40NzEtLjM4NyAxLjI0Mi0uMzg3IDEuNzEzIDBsMy4yMyAzLjQ2MWMuNDYyLjM4LjMyMi45OS0uMTQgMS4zNjhsLS4yNTIuMjA2Yy0uNDUuMzY5LS43MTUuOTY1LS4yNDggMS4zMTkuMjYzLjE5OS42MjcuMjg2Ljk4MS4yMzRsMTQuODk0LTIuMTQ4YzEuMTI3LS4xNjUgMS44NzUuOTE4IDEuMTEgMS42MDhsLTIuMzAyIDIuMDhjLS40MDcuMzY3LS4zNDkuOTM2LjEyNiAxLjI0NC40ODcuMzE2LjUyOC44OTUuMDU3IDEuMjI2YTI2LjUzMyAyNi41MzMgMCAwMS02LjM0IDMuMjM1Yy0zLjg2NyAxLjM2LTYuNDMzIDEuOTMtNi45OTkgMi4wNTZhMS41MDcgMS41MDcgMCAwMC0uMjQ3LjA3N2wtLjgzOC4zNDRhMS4xNCAxLjE0IDAgMDAtLjQ5Mi4zNzJsLTIuNDU3IDMuNTVjLS40NjYuNjM3LTEuNjA1LjYzNy0yLjA3MSAwbC0yLjQ1Ny0zLjU1YTEuMTQgMS4xNCAwIDAwLS40OTItLjM3MmwtLjgzOC0uMzQ0YTEuNTEzIDEuNTEzIDAgMDAtLjI0Ny0uMDc2Yy0uNTY3LS4xMjYtMy4xMzMtLjY5Ny03LTIuMDU3LTMuMTQ1LTEuMTA1LTUuNDM2LTIuNTg0LTYuNTA5LTMuMzU2LS4zNjYtLjI2My0uMzEyLS43Mi4wOTItLjk0NS4zNzktLjIxLjQ1OS0uNjM1LjE3NS0uOTI2eiIgZmlsbD0iI2ZmZiIvPjxkZWZzPjxyYWRpYWxHcmFkaWVudCBpZD0icHJlZml4X19wcmVmaXhfX3BhaW50MF9hbmd1bGFyXzIxMjdfMTA1NTA2IiBjeD0iMCIgY3k9IjAiIHI9IjEiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIiBncmFkaWVudFRyYW5zZm9ybT0ibWF0cml4KDAgMjQgLTI0IDAgMjUgMjUpIj48c3RvcCBzdG9wLWNvbG9yPSIjRTc3Ii8+PHN0b3Agb2Zmc2V0PSIuNTIxIiBzdG9wLWNvbG9yPSIjRTA3Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjNzdFIi8+PC9yYWRpYWxHcmFkaWVudD48ZmlsdGVyIGlkPSJwcmVmaXhfX3ByZWZpeF9fZmlsdGVyMF9iXzIxMjdfMTA1NTA2IiB4PSItMTYiIHk9Ii0xNiIgd2lkdGg9IjgyIiBoZWlnaHQ9IjgyIiBmaWx0ZXJVbml0cz0idXNlclNwYWNlT25Vc2UiIGNvbG9yLWludGVycG9sYXRpb24tZmlsdGVycz0ic1JHQiI+PGZlRmxvb2QgZmxvb2Qtb3BhY2l0eT0iMCIgcmVzdWx0PSJCYWNrZ3JvdW5kSW1hZ2VGaXgiLz48ZmVHYXVzc2lhbkJsdXIgaW49IkJhY2tncm91bmRJbWFnZSIgc3RkRGV2aWF0aW9uPSI4Ii8+PGZlQ29tcG9zaXRlIGluMj0iU291cmNlQWxwaGEiIG9wZXJhdG9yPSJpbiIgcmVzdWx0PSJlZmZlY3QxX2JhY2tncm91bmRCbHVyXzIxMjdfMTA1NTA2Ii8+PGZlQmxlbmQgaW49IlNvdXJjZUdyYXBoaWMiIGluMj0iZWZmZWN0MV9iYWNrZ3JvdW5kQmx1cl8yMTI3XzEwNTUwNiIgcmVzdWx0PSJzaGFwZSIvPjwvZmlsdGVyPjwvZGVmcz48L3N2Zz4=';
export { COMMUNITY_ITEMS, MAIN_ITEMS, SOCIAL_MEDIA_ITEMS, SUPPORT_ITEMS, WALLET_ICON };
