import { IS_PRODUCTION } from '@/consts/global';

export const CHAINS = IS_PRODUCTION
  ? 'https://raw.githubusercontent.com/soramitsu/fearless-utils/v4/chains/chains.json'
  : 'https://raw.githubusercontent.com/soramitsu/fearless-utils/v4/chains/chains_dev.json';
export const ASSETS = IS_PRODUCTION
  ? 'https://raw.githubusercontent.com/soramitsu/fearless-utils/v4/chains/assets.json'
  : 'https://raw.githubusercontent.com/soramitsu/fearless-utils/v4/chains/assets_dev.json';

export const FIATS = 'https://raw.githubusercontent.com/soramitsu/fearless-utils/android/2.0.8/fiat/fiats.json';

export const ORML_PALLETS_TYPES = ['ormlChain', 'equilibrium'];

export const prepNetworkNames: Record<string, string> = {
  'Integritee Network (Kusama)': 'Integritee Network',
};
