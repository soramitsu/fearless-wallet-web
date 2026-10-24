import { FPNumber } from '@sora-substrate/util';
import type { Wallet } from '@/stores';
import { type NetworkName, WalletEcosystem } from '@/interfaces';
import { isTonNetwork } from '@/helpers';
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

export function getTransferWalletRecipient(wallet: Wallet, network: NetworkName): string {
  return BaseApi.formatAddress(wallet, network);
}

/**
 * The address on `network` of one of the user's own wallets, or '' when that wallet has none there.
 * Only wallets in `wallets` can be named, so a route can preselect a recipient but never supply one.
 */
export function getOwnWalletRecipient(
  wallets: (Wallet & { walletEcosystem?: WalletEcosystem })[],
  address: string,
  network: NetworkName
): string {
  const wallet = wallets.find((candidate) => candidate.address === address);

  if (!wallet) return '';

  const isTonWallet = wallet.walletEcosystem === WalletEcosystem.Ton;

  if (isTonNetwork(network)) return isTonWallet ? wallet.address : '';
  if (isTonWallet) return '';

  const recipient = getTransferWalletRecipient(wallet, network);

  return recipient && BaseApi.validateAddress(recipient, network) ? recipient : '';
}

export function isTransferWalletRecipient(wallet: Wallet, recipient: string, network: NetworkName): boolean {
  return (
    getTransferWalletRecipient(wallet, network) ===
    BaseApi.formatAddress({ address: recipient, ethereumAddress: recipient }, network)
  );
}
