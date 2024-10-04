import store, { type NetworkParams } from '@/store';
import { type NetworkName } from '@/interfaces';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as ExtensionGettersTypes } from '@/store/extension/getters';
import { GettersTypes as StakingGettersTypes } from '@/store/staking/getters';

const hasSelectedWallet = () => store.getters[AccountsGettersTypes.selectedWallet].address.length !== 0;
const haveAuthRequests = (): number => store.getters[ExtensionGettersTypes.authList].length;
const haveSignRequests = (): number => store.getters[ExtensionGettersTypes.signList].length;
const haveMetaRequests = (): number => store.getters[ExtensionGettersTypes.metaRequests].length;
const showSoraCard = (): boolean => store.getters[ExtensionGettersTypes.features]?.fiat?.soraCard;
const getStakingNetwork = async (network: NetworkName): Promise<NetworkParams> =>
  await new Promise((res) => setTimeout(() => res(store.getters[StakingGettersTypes.getStakingNetwork](network)), 100));

export { getStakingNetwork, haveAuthRequests, hasSelectedWallet, showSoraCard, haveMetaRequests, haveSignRequests };
