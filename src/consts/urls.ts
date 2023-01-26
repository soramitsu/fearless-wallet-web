const CHAINS = 'https://raw.githubusercontent.com/soramitsu/fearless-utils/ios/v3/chains/chains_dev.json';
const ASSETS = 'https://raw.githubusercontent.com/soramitsu/fearless-utils/ios/v3/chains/assets_dev.json';
const FIATS = 'https://raw.githubusercontent.com/soramitsu/fearless-utils/android/2.0.8/fiat/fiats.json';

const TERMS = 'https://fearlesswallet.io/terms/';
const PRIVACY = 'https://fearlesswallet.io/privacy/';
const FEARLESS_WALLET = 'https://fearlesswallet.io/';
const WIKI = 'https://wiki.sora.org/master';
const GITHUB = 'https://github.com/soramitsu/fearless-wallet-web';
const TELEGRAM = 'https://t.me/fearlesswallet';
const MEDIUM = 'https://medium.com/fearlesswallet';
const INSTAGRAM = 'https://www.instagram.com/fearless_wallet';
const TWITTER = 'https://twitter.com/fearlesswallet';
const YOUTUBE = 'https://www.youtube.com/fearlesswallet';
const ANNOUNCEMENTS = 'https://t.me/fearless_announcements';
const FEARLESS_HAPPINESS = 'https://t.me/fearlesshappiness';
const EMAIL = 'fearless@soramitsu.co.jp';

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
};

const BASE_URLS_PREFIX = {
  MOONPAY: 'https://buy.moonpay.com',
  RAMP: 'https://buy.ramp.network',
  GOOGLE: 'https://accounts.google.com',
};

const BASE_URLS_SUFFIX = {
  SUBSCAN: 'subscan.io',
};

export function isSafeForExternalOpen(url: string): boolean {
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
