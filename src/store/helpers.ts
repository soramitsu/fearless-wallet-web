import { Networks } from './networks/types';

export function getNetworkInfo(networks: Networks, networksName: string) {
  return networks.find(({ name }) => name === networksName);
}
