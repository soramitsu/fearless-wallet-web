import { ProposalTypes, SessionTypes } from '@walletconnect/types';
import {
  WALLET_CONNECT_EIP155_NAMESPACE,
  WALLET_CONNECT_POLKADOT_NAMESPACE,
} from '@extension-base/services/wallet-connect-service/consts';
import { ChainData, SessionProposalNamespaces } from '@/screens/walletConnect/types';
import { NetworkJson } from '@/extension/background/extension-base/src/types';
import { useStore } from '@/store';
import { _getSubstrateGenesisHash } from '@/extension/background/extension-base/src/services/chain-service/helpers';

export const findChainInfoByHalfGenesisHash = (
  chainMap: NetworkJson[],
  halfGenesisHash?: string
): NetworkJson | null => {
  if (!halfGenesisHash) {
    return null;
  }

  for (const chainInfo of chainMap) {
    if (
      _getSubstrateGenesisHash(chainInfo)
        ?.toLowerCase()
        .substring(2, 2 + 32) === halfGenesisHash.toLowerCase()
    ) {
      return chainInfo;
    }
  }

  return null;
};

export const chainNamesFromRequest = (
  namespaces: SessionTypes.Namespaces | ProposalTypes.RequiredNamespaces,
  key: string
): ChainData[] => {
  const store = useStore();
  const networks: NetworkJson[] = store.getters.allNetworks;
  const chains = namespaces[key].chains;
  const names: ChainData[] = [];

  if (!chains) return names;

  if (key === WALLET_CONNECT_EIP155_NAMESPACE) {
    chains.forEach((chain) => {
      const [, chainId] = chain.split(':');

      const net = networks.find((el) => parseInt(`0x${el.chainId}`) === +chainId);

      if (net) names.push({ icon: net.icon, name: net.name, connected: net.active });
    });
  } else if (key === WALLET_CONNECT_POLKADOT_NAMESPACE) {
    chains.forEach((chain) => {
      const [, chainId] = chain.split(':');

      const network = findChainInfoByHalfGenesisHash(networks, chainId);
      if (network) names.push({ connected: network.active, icon: network.icon, name: network.name });
    });
  }

  return names;
};

export const transformNamespaces = (namespaces: SessionProposalNamespaces): ChainData[] => {
  const chainData: ChainData[] = [];

  Object.keys(namespaces).forEach((namespace) => chainData.push(...chainNamesFromRequest(namespaces, namespace)));

  return chainData;
};
