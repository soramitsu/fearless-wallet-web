import { IS_PRODUCTION } from '@/consts/global';

const SORA_MAINNET = 'sora mainnet';
const SORA_TEST = 'sora test';
const SORA_NETWORK_NAME = IS_PRODUCTION ? SORA_MAINNET : SORA_TEST;

const SORA_XOR_ASSET_ID = IS_PRODUCTION
  ? 'b774c386-5cce-454a-a845-1ec0381538ec'
  : 'b5a44630-920e-43ee-809f-61890d0888b0';

const SORA_VAL_ASSET_ID = IS_PRODUCTION
  ? '24d0809e-0a4c-42ea-bdd8-dc7a518f389c'
  : '0ecacd48-ffd4-4a2e-87e3-c5f72f9a9877';

const SORA_UTILITY_ASSET = 'xor';
const SORA_REWARD_ASSET = 'val';
const SORA_ICON =
  'https://raw.githubusercontent.com/soramitsu/shared-features-utils/master/icons/chains/white/SORA.svg';

export {
  SORA_NETWORK_NAME,
  SORA_UTILITY_ASSET,
  SORA_XOR_ASSET_ID,
  SORA_MAINNET,
  SORA_TEST,
  SORA_REWARD_ASSET,
  SORA_ICON,
  SORA_VAL_ASSET_ID,
};
