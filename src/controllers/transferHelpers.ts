import { FPNumber } from '@sora-substrate/util';
import { type NetworkName } from '@/interfaces';
import { type Wallet } from '@/store';
import BaseApi from '@/util/BaseApi';

export function getCostOfAssets(
  count: number | string,
  price: number,
  returnType: 'string' | 'number' = 'number'
): number | string {
  const fp = new FPNumber(count).mul(new FPNumber(price));

  if (returnType === 'string') return fp.toString();

  return fp.toNumber();
}

export function getTransactionAddress(wallet: Wallet, network: NetworkName): string {
  const { address, ethereumAddress } = wallet;

  return BaseApi.isEthereumNetwork(network) ? ethereumAddress : address;
}
