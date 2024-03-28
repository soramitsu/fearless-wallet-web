import { type NetworkName } from '@/interfaces';

export interface MyPoolsInfo {
  test: string;
}

export interface PoolsParams {
  network: NetworkName;
}

export type PoolsParamsRequest = {
  networks: NetworkName[];
};

export type PoolsParamsResponse = PoolsParams[];

export type PoolsNetworkRequest = {
  network: NetworkName;
};

export type MyPoolsInfoResponse = MyPoolsInfo;
