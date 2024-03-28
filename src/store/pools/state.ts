import { SORA_ICON, SORA_NETWORK_NAME, SORA_UTILITY_ASSET, SORA_XOR_ASSET_ID } from '@/consts/sora';
import { type PoolsNetworkParams } from '@/store/pools/types';
import { getDefaultPoolsParams } from '@/helpers/pools';

export type State = {
  allPoolsItems: Omit<PoolsNetworkParams, 'bondAmount'>[];
};

const getDefaultPoolsItemsParams = (poolsParams: Partial<PoolsNetworkParams>) => {
  return {
    ...poolsParams,
    transferableAmount: '0',
    loading: true,
    ...getDefaultPoolsParams(poolsParams.network!),
  } as Omit<PoolsNetworkParams, 'bondAmount'>;
};

const POOLS_ITEMS: Partial<PoolsNetworkParams>[] = [
  {
    network: SORA_NETWORK_NAME,
    asset: SORA_UTILITY_ASSET,
    assetId: SORA_XOR_ASSET_ID,
    icon: SORA_ICON,
    type: 'regular',
  },
];

const state = (): State => {
  return {
    allPoolsItems: POOLS_ITEMS.map((params) => getDefaultPoolsItemsParams(params)),
  };
};

export default state;
