import { FPNumber } from '@sora-substrate/util';
import { NetworkName } from '@/interfaces';
import store, { Wallet } from '@/store';
import BaseApi from '@/util/BaseApi';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';

export function calculateCost(count: FPNumber, price: number): FPNumber {
  const FPPrice = new FPNumber(price);

  return count.mul(FPPrice);
}

export function getCostOfAssets(count: number, price: number): number {
  return calculateCost(new FPNumber(count), price).toNumber();
}

export function getTransactionAddress(wallet: Wallet, network: NetworkName): string {
  const { address, ethereumAddress } = wallet;

  return BaseApi.isEthereumNetwork(network) ? ethereumAddress : address;
}
