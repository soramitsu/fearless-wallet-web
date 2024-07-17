import store, { type NetworkParams } from '@/store';
import { type NetworkName } from '@/interfaces';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

const haveSelectedWallet = () => store.getters[AccountsGettersTypes.selectedWallet].address.length !== 0;
const haveAuthRequests = (): number => store.getters.authList.length;
const haveSignRequests = (): number => store.getters.signList.length;
const haveMetaRequests = (): number => store.getters.metaRequests.length;
const showSoraCard = (): boolean => store.getters.features?.fiat?.soraCard;
const getStakingNetwork = async (network: NetworkName): Promise<NetworkParams> =>
  await new Promise((res) => setTimeout(() => res(store.getters.getStakingNetwork(network)), 100));

export { getStakingNetwork, haveAuthRequests, haveSelectedWallet, showSoraCard, haveMetaRequests, haveSignRequests };
