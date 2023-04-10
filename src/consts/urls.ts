import { IS_PRODUCTION } from '@/consts/global';

const CHAINS = IS_PRODUCTION
  ? 'https://raw.githubusercontent.com/soramitsu/fearless-utils/v4/chains/chains.json'
  : 'https://raw.githubusercontent.com/soramitsu/fearless-utils/v4/chains/chains_dev.json';
const ASSETS = IS_PRODUCTION
  ? 'https://raw.githubusercontent.com/soramitsu/fearless-utils/v4/chains/assets.json'
  : 'https://raw.githubusercontent.com/soramitsu/fearless-utils/v4/chains/assets_dev.json';
const FIATS = 'https://raw.githubusercontent.com/soramitsu/fearless-utils/android/2.0.8/fiat/fiats.json';

const FEARLESS_TERMS = 'https://fearlesswallet.io/terms/';
const FEARLESS_PRIVACY = 'https://fearlesswallet.io/privacy/';
const SORA_CARD_PRIVACY = 'https://soracard.com/terms/en/polkaswap/';
const SORA_CARD_TERMS = 'https://soracard.com/privacy/en/polkaswap/';
const FEARLESS_WALLET = 'https://fearlesswallet.io/';
const WIKI = 'https://wiki.fearlesswallet.io/';
const GITHUB = 'https://github.com/soramitsu/fearless-wallet-web';
const TELEGRAM = 'https://t.me/fearlesswallet';
const MEDIUM = 'https://medium.com/fearlesswallet';
const INSTAGRAM = 'https://www.instagram.com/fearless_wallet';
const TWITTER = 'https://twitter.com/fearlesswallet';
const YOUTUBE = 'https://www.youtube.com/fearlesswallet';
const ANNOUNCEMENTS = 'https://t.me/fearless_announcements';
const FEARLESS_HAPPINESS = 'https://t.me/fearlesshappiness';
const EMAIL = 'fearless@soramitsu.co.jp';
const POLKASWAP_FAQ = 'https://wiki.sora.org/ecosystem/what-is-polkaswap/polkaswap-faq';
const POLKASWAP_MEMORANDUM = 'https://wiki.sora.org/ecosystem/what-is-polkaswap/terms';
const POLKASWAP_POLICY = 'https://wiki.sora.org/ecosystem/what-is-polkaswap/privacy';

const URLS = {
  ASSETS,
  FIATS,
  CHAINS,
  FEARLESS_TERMS,
  FEARLESS_PRIVACY,
  FEARLESS_WALLET,
  GITHUB,
  WIKI,
  TELEGRAM,
  MEDIUM,
  INSTAGRAM,
  TWITTER,
  YOUTUBE,
  ANNOUNCEMENTS,
  FEARLESS_HAPPINESS,
  EMAIL,
  SORA_CARD_PRIVACY,
  SORA_CARD_TERMS,
  POLKASWAP_FAQ,
  POLKASWAP_MEMORANDUM,
  POLKASWAP_POLICY,
};

const BASE_URLS_PREFIX = {
  MOONPAY: 'https://buy.moonpay.com',
  RAMP: 'https://buy.ramp.network',
  GOOGLE: 'https://accounts.google.com',
};

const BASE_URLS_SUFFIX = {
  SUBSCAN: 'subscan.io',
};

function isSafeForExternalOpen(url: string): boolean {
  if (!url) {
    return false;
  }

  if (Object.values(URLS).includes(url)) {
    return true;
  }

  if (Object.values(BASE_URLS_PREFIX).some((item) => url.startsWith(item))) {
    return true;
  }

  if (Object.values(BASE_URLS_SUFFIX).some((item) => url.includes(item))) {
    return true;
  }

  return false;
}

export { URLS, BASE_URLS_PREFIX, isSafeForExternalOpen };
