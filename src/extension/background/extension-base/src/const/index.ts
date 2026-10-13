import sunBadge from '@/assets/brand/winged-sun-badge.svg?raw';
import { IS_PRODUCTION } from '@/consts/global';
import { URLS } from '@/consts/urls';
import { type EIP6963ProviderInfo } from '@/extension/entry/types';

export const EXTENSION_REQUEST_URL = 'extension';

const { BASE_URL } = URLS;

export const ONBOARDING_URL = IS_PRODUCTION
  ? `${BASE_URL}/master/appConfigs/onboarding/web.json`
  : `${BASE_URL}/develop-free/appConfigs/onboarding/web.json`;

export const FALLBACK_LANG = 'en-EN';
export const EXTENSION_ID = 'nhlnehondigmgckngjomcpcefcdplmgc';
export const EXTENSION_URL = `chrome-extension://${EXTENSION_ID}/popup.html`;
export const EXTENSION_HOSTNAME = '39fb1478-3519-4b4e-8eba-15e6e594494c';

export const eip6963ProviderInfo: EIP6963ProviderInfo = {
  uuid: 'd1dc1445-2b9c-4c17-877a-7790fadfcc05',
  name: 'Fearless Wallet',
  icon: `data:image/svg+xml,${encodeURIComponent(sunBadge)}`,
  rdns: 'io.fearlesswallet',
};
