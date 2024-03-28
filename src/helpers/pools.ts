import type { DefaultPoolsParams } from '@extension-base/services/pools-service/types';
import type { NetworkName } from '@/interfaces';

const getDefaultPoolsParams = (network: NetworkName): DefaultPoolsParams => ({
  network,
  apr: 0,
});

export { getDefaultPoolsParams };
