import { IS_PRODUCTION } from '@/consts/global';

const CHAINS = IS_PRODUCTION
  ? 'https://raw.githubusercontent.com/soramitsu/fearless-utils/v4/chains/chains.json'
  : 'https://raw.githubusercontent.com/soramitsu/fearless-utils/v4/chains/chains_dev.json';
const ASSETS = IS_PRODUCTION
  ? 'https://raw.githubusercontent.com/soramitsu/fearless-utils/v4/chains/assets.json'
  : 'https://raw.githubusercontent.com/soramitsu/fearless-utils/v4/chains/assets_dev.json';
const FIATS = 'https://raw.githubusercontent.com/soramitsu/fearless-utils/android/2.0.8/fiat/fiats.json';

const TERMS = 'https://fearlesswallet.io/terms/';
const PRIVACY = 'https://fearlesswallet.io/privacy/';
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
  TERMS,
  PRIVACY,
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

export default URLS;
export { isSafeForExternalOpen, BASE_URLS_PREFIX };
