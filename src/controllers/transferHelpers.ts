import { NetworkName } from '@/interfaces';
import { Wallet } from '@/store';
import BaseApi from '@/util/BaseApi';
import { FPNumber } from '@/util/fp';

export function calculateCost(count: FPNumber, price: number): FPNumber {
  const FPPrice = new FPNumber(price);

  return count.mul(FPPrice);
}

export function getCostOfAssets(count: string, price: number): number {
  return calculateCost(new FPNumber(count), price).toNumber();
}

export function getTransactionAddress(wallet: Wallet, network: NetworkName): string {
  const { address, ethereumAddress } = wallet;
  // const replacedAccount = BaseApi.getReplacedAccountByNetwork(wallet, network);

  // if (replacedAccount) {
  //   const { address } = replacedAccount;

  //   return address;
  // }

  return BaseApi.isEthereumNetwork(network) ? ethereumAddress : address;
}

// public getBalanceInNetwork( _network: string) {
//   const walletBalance = this.ba

//   const balance = walletBalance.find(({ network }) => network === _network)?.balance;

//   if (balance === undefined) return mockBalance;

//   const { frozen, locked, reserved, total, transferable } = balance;

//   return {
//     frozen: {
//       value: frozen.toString(),
//       fiat: this.calculateCost(frozen).toString(),
//     },
//     locked: {
//       value: locked.toString(),
//       fiat: this.calculateCost(locked).toString(),
//     },
//     reserved: {
//       value: reserved.toString(),
//       fiat: this.calculateCost(reserved).toString(),
//     },
//     total: {
//       value: total.toString(),
//       fiat: this.calculateCost(total).toString(),
//     },
//     transferable: {
//       value: transferable.toString(),
//       fiat: this.calculateCost(transferable).toString(),
//     },
//   };
// }

// function getTransferableCountAssets(wallet: Wallet, _network: NetworkName): string {
//   return getBalanceInNetwork(wallet, _network).transferable.value;
// }
