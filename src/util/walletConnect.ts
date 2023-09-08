import { ProposalTypes, SessionTypes } from '@walletconnect/types';
import { WALLET_CONNECT_EIP155_NAMESPACE } from '@extension-base/services/wallet-connect-service/consts';
import { ChainData, SessionProposalNamespaces } from '@/screens/walletConnect/types';
import { NetworkJson } from '@/extension/background/extension-base/src/types';
import { useStore } from '@/store';

export const chainNamesFromRequest = (
  namespaces: SessionTypes.Namespaces | ProposalTypes.RequiredNamespaces,
  key: string
): ChainData[] => {
  const store = useStore();
  const networks: NetworkJson[] = store.getters.allNetworks;
  const chains = namespaces[key].chains;
  const names: ChainData[] = [];

  if (key === WALLET_CONNECT_EIP155_NAMESPACE && chains) {
    chains.forEach((chain) => {
      const [, chainId] = chain.split(':');
      const net = networks.find((el) => parseInt(`0x${el.chainId}`) === +chainId);

      if (net) names.push({ icon: net.icon, name: net.name, connected: net.active });
    });
  }

  return names;
};

export const transformNamespaces = (namespaces: SessionProposalNamespaces): ChainData[] => {
  const chainData: ChainData[] = [];

  Object.keys(namespaces).forEach((namespace) => chainData.push(...chainNamesFromRequest(namespaces, namespace)));

  return chainData;
};
