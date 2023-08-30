import { IS_PRODUCTION } from '@/consts/global';
import { URLS } from '@/consts/urls';

const { BASE_URL } = URLS;

export const ONBOARDING_URL = IS_PRODUCTION
  ? `${BASE_URL}/master/appConfigs/onboarding/web.json`
  : `${BASE_URL}/develop-free/appConfigs/onboarding/web.json`;

export const FALLBACK_LANG = 'en-EN';
