import { IS_PRODUCTION } from '@/consts/global';

const BASE_URL = 'https://raw.githubusercontent.com/soramitsu/shared-features-utils';

const CHAINS = IS_PRODUCTION
  ? `${BASE_URL}/master/chains/v13/chains.json`
  : `${BASE_URL}/develop-free/chains/v13/chains_dev.json`;

const FIATS = `${BASE_URL}/master/fiat/fiats.json`;

const FEATURES = IS_PRODUCTION
  ? `${BASE_URL}/master/appConfigs/web_config.json`
  : `${BASE_URL}/develop-free/appConfigs/web_config.json`;

const XCM_LOCATIONS = `${BASE_URL}/master/xcm/v2/xcm_token_locations.json`;

const XCM_FEES = IS_PRODUCTION
  ? `${BASE_URL}/master/xcm/v2/xcm_fees.json`
  : `${BASE_URL}/develop-free/xcm/v2/xcm_fees.json`;

const ONBOARDING_URL = `${BASE_URL}/master/appConfigs/onboarding/web.json`;

const SCAM = `${BASE_URL}/master/scamDetection/Polkadot_Hot_Wallet_Attributions.csv`;

const BASE_URLS_PREFIX = {
  MOONPAY: 'https://buy.moonpay.com',
  RAMP: 'https://app.ramp.network',
  GOOGLE: 'https://accounts.google.com',
};

const FEARLESS_TERMS = 'https://fearlesswallet.io/terms/';
const FEARLESS_PRIVACY = 'https://fearlesswallet.io/privacy/';
const FEARLESS_WALLET = 'https://fearlesswallet.io/';
const WIKI = 'https://wiki.fearlesswallet.io/';
const GITHUB = 'https://github.com/soramitsu/shared-features-utils';
const TELEGRAM = 'https://t.me/fearlesswallet';
const MEDIUM = 'https://medium.com/fearlesswallet';
const INSTAGRAM = 'https://www.instagram.com/fearless_wallet';
const TWITTER = 'https://twitter.com/fearlesswallet';
const YOUTUBE = 'https://www.youtube.com/fearlesswallet';
const ANNOUNCEMENTS = 'https://t.me/fearless_announcements';
const FEARLESS_HAPPINESS = 'https://t.me/fearlesshappiness';
const EMAIL = 'fearless@soramitsu.co.jp';
const POLKASWAP_FAQ = 'https://wiki.sora.org/polkaswap/polkaswap-faq';
const POLKASWAP_MEMORANDUM = 'https://wiki.sora.org/polkaswap/terms';
const POLKASWAP_POLICY = 'https://wiki.sora.org/polkaswap/privacy';
const POLKASWAP = IS_PRODUCTION ? 'https://polkaswap.io' : 'https://exchange.dev.sora2.tachi.soramitsu.co.jp/'; // https://test.polkaswap.io

const URLS = {
  BASE_URL,
  FIATS,
  FEATURES,
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
  POLKASWAP_FAQ,
  POLKASWAP_MEMORANDUM,
  POLKASWAP_POLICY,
  POLKASWAP,
  XCM_LOCATIONS,
  XCM_FEES,
  ONBOARDING_URL,
  SCAM,
};

export { URLS, BASE_URLS_PREFIX };
