import { isEthereumAddress } from '@polkadot/util-crypto';
import { WalletEcosystem } from '@/interfaces';

/**
 * The ecosystem of an account or of the stored selected wallet. Records written by 1.x-2.7.x have no
 * walletEcosystem: such an account is EVM when its address is an Ethereum address and Substrate otherwise, as
 * 3.0.5 treated it. TON accounts come from the TON keyring, which always records theirs. Nothing is written back.
 */
export function walletEcosystemOf(address: string | undefined, walletEcosystem?: WalletEcosystem): WalletEcosystem {
  if (walletEcosystem) return walletEcosystem;

  return address && isEthereumAddress(address) ? WalletEcosystem.Evm : WalletEcosystem.Substrate;
}
