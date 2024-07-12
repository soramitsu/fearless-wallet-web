import { type ProposalTypes, type SessionTypes } from '@walletconnect/types';
import {
  WALLET_CONNECT_EIP155_NAMESPACE,
  WALLET_CONNECT_POLKADOT_NAMESPACE,
} from '@extension-base/services/wallet-connect-service/consts';
import { type NetworkJson } from '@extension-base/types';
import { getSubstrateGenesisHash } from '@extension-base/services/network-service/helpers';
import { type ChainData, type SessionProposalNamespaces } from '@/interfaces/walletconnect';
import { useStore } from '@/store';

export const findChainInfoByHalfGenesisHash = (
  chainMap: NetworkJson[],
  halfGenesisHash?: string
): NetworkJson | null => {
  if (!halfGenesisHash) {
    return null;
  }

  for (const chainInfo of chainMap) {
    if (
      getSubstrateGenesisHash(chainInfo)
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
  key: string,
  isRequired: boolean
): ChainData[] => {
  const store = useStore();
  const networks: NetworkJson[] = store.getters.allNetworks;
  const chains = namespaces[key].chains;
  const names: ChainData[] = [];

  if (!chains) return names;

  if (key === WALLET_CONNECT_EIP155_NAMESPACE) {
    for (const chain of chains) {
      const [, chainId] = chain.split(':');

      const net = networks.find((el) => +el.chainId === +chainId);

      if (net) names.push({ icon: net.icon, name: net.name, connected: net.active });
      else if (isRequired) {
        names.splice(0, names.length);
        break;
      }
    }
  } else if (key === WALLET_CONNECT_POLKADOT_NAMESPACE) {
    for (const chain of chains) {
      const [, chainId] = chain.split(':');

      const network = findChainInfoByHalfGenesisHash(networks, chainId);

      if (network) names.push({ connected: network.active, icon: network.icon, name: network.name });
      else if (isRequired) {
        names.splice(0, names.length);
        break;
      }
    }
  }

  return names;
};

export const transformNamespaces = (namespaces: SessionProposalNamespaces, isRequired: boolean): ChainData[] => {
  const chainData: ChainData[] = [];

  Object.keys(namespaces).forEach((namespace) =>
    chainData.push(...chainNamesFromRequest(namespaces, namespace, isRequired))
  );

  return chainData;
};
