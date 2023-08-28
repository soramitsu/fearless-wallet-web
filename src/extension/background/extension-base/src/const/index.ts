import { IS_PRODUCTION } from '@/consts/global';
import { URLS } from '@/consts/urls';
export const ALL_ACCOUNT_KEY = 'ALL';
export const ALL_NETWORK_KEY = 'all';
export const EXTENSION_REQUEST_URL = 'extension';

const { BASE_URL } = URLS;
export const moonbeamBaseChains = ['moonbase', 'moonbeam', 'moonriver'];
export const IGNORE_GET_SUBSTRATE_FEATURES_LIST: string[] = [
  'astarEvm',
  'ethereum',
  'ethereum_goerli',
  'binance',
  'binance_test',
  'boba_rinkeby',
  'boba',
  'bobabase',
  'bobabeam',
];
export const ONBOARDING_URL = IS_PRODUCTION
  ? `${BASE_URL}/master/appConfigs/onboarding/web.json`
  : `${BASE_URL}/develop-free/appConfigs/onboarding/web.json`;

export const FALLBACK_LANG = 'en-EN';
