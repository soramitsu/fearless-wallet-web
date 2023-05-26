import { FPNumber } from '@sora-substrate/util';
import { NetworkName } from '@/interfaces';
import { Wallet } from '@/store';
import BaseApi from '@/util/BaseApi';

export function getCostOfAssets(count: number, price: number): number {
  return new FPNumber(count).mul(new FPNumber(price)).toNumber();
}

export function getTransactionAddress(wallet: Wallet, network: NetworkName): string {
  const { address, ethereumAddress } = wallet;

  return BaseApi.isEthereumNetwork(network) ? ethereumAddress : address;
}
