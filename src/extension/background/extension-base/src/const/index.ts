import { IS_PRODUCTION } from '@/consts/global';
import { URLS } from '@/consts/urls';
export const ALL_ACCOUNT_KEY = 'ALL';
export const ALL_NETWORK_KEY = 'all';
export const EXTENSION_REQUEST_URL = 'extension';

const { BASE_URL } = URLS;

export const ONBOARDING_URL = IS_PRODUCTION
  ? `${BASE_URL}/master/appConfigs/onboarding/web.json`
  : `${BASE_URL}/develop-free/appConfigs/onboarding/web.json`;

export const FALLBACK_LANG = 'en-EN';
export const EXTENSION_ID = 'nhlnehondigmgckngjomcpcefcdplmgc';
export const EXTENSION_HOSTNAME = '39fb1478-3519-4b4e-8eba-15e6e594494c';
