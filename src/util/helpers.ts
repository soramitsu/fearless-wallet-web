import { Networks } from '@/store/networks/types';

export function firstCharToUp(string: string) {
  return `${string.charAt(0).toUpperCase()}${string.slice(1)}`;
}

export function getNetworkInfo(networks: Networks, networksName: string) {
  return networks.find(({ name }) => name === networksName);
}
