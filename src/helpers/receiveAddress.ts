import { decodeAddress, encodeAddress } from '@polkadot/util-crypto';
import { Address } from '@ton/core';
import { walletEcosystemOf } from '@extension-base/background/helpers/walletEcosystem';
import type { AccountJson } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type { SelectedWallet } from '@/stores/accounts/types';
import { WalletEcosystem } from '@/interfaces';
import { isTestnetNetwork } from '@/portfolio/zeroRule';
import BaseApi from '@/util/BaseApi';
import { encodeIrohaI105Address, isIrohaI105Address, resolveCanonicalIrohaAddressNetwork } from '@/util/iroha';

/** The wallet's receiving address on the selected chain, or an empty string when it has none. */
export function receiveAddressForNetwork(wallet: SelectedWallet, account: AccountJson | undefined, network: NetworkJson): string {
  if (!wallet.address) return '';

  const ecosystem = String(network.ecosystem).toLowerCase();
  const family = ecosystem.startsWith('ethereum') ? WalletEcosystem.Evm : ecosystem;
  const primary = walletEcosystemOf(wallet.address, wallet.walletEcosystem) === family ? wallet.address : '';
  const members = account?.universalWallet?.publicAccounts?.filter((member) => member.ecosystem === family) ?? [];
  const member = members.find(({ chainId }) => chainId === network.chainId) ?? members.find(({ isDefault }) => isDefault) ?? members[0];
  const address = member?.address || primary;

  try {
    switch (family) {
      case WalletEcosystem.Substrate: {
        const key = decodeAddress(address);
        return key.length === 32 || key.length === 33 ? encodeAddress(key, network.addressPrefix ?? network.ss58Format) : '';
      }
      case WalletEcosystem.Evm: {
        const evm = wallet.ethereumAddress || address;
        return BaseApi.isEthereumAddress(evm) ? evm : '';
      }
      case WalletEcosystem.Solana: {
        const solana = wallet.solanaAddress || address;
        return BaseApi.isSolanaAddress(solana) ? solana : '';
      }
      case WalletEcosystem.Bitcoin: {
        const testnet = network.chainId === 'bitcoin:testnet' || isTestnetNetwork(network);
        const candidates = [testnet ? wallet.bitcoinTestnetAddress : wallet.bitcoinAddress, ...members.map((item) => item.address), primary];
        return candidates.find((candidate) => candidate && BaseApi.isBitcoinAddress(candidate, testnet ? 'testnet' : 'mainnet')) ?? '';
      }
      case WalletEcosystem.Ton: {
        const ton = member?.address || account?.tonAddress || primary;
        const testnet = network.chainId === '-3' || isTestnetNetwork(network);
        if (Address.isFriendly(ton)) {
          const friendly = Address.parseFriendly(ton);
          if (friendly.isTestOnly && !testnet) return '';
          if (friendly.isTestOnly === testnet) return ton;
          return friendly.address.toString({ bounceable: friendly.isBounceable, testOnly: testnet });
        }
        return Address.parse(ton).toString({ bounceable: false, testOnly: testnet });
      }
      case WalletEcosystem.Iroha: {
        const chain = resolveCanonicalIrohaAddressNetwork(network.chainId);
        const encoded = [member?.address, wallet.irohaAddress, primary].find((candidate) => candidate && isIrohaI105Address(candidate, chain));
        if (encoded) return encoded;
        const publicKey = member?.publicKeyHex || wallet.irohaPublicKeyHex;
        return publicKey ? encodeIrohaI105Address(publicKey, chain) : '';
      }
      default:
        return '';
    }
  } catch {
    // Unsupported chain IDs and malformed stored addresses cannot supply a deposit address.
    return '';
  }
}
