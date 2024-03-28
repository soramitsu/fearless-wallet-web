import { type PoolsParams } from '@extension-base/services/pools-service/types';
import { type NetworkName } from '@/interfaces';

const getDefaultPoolsParams = (network: NetworkName): PoolsParams => ({
  network,
});

export { getDefaultPoolsParams };
