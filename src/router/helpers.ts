import type { NetworkName } from '@/interfaces';
import type { NetworkParams } from '@/stores';
import type { ExtensionStore } from '@/stores/extension';
import type { AccountStore } from '@/stores/accounts';
import type { StakingStore } from '@/stores/staking';

const hasSelectedWallet = (accountsStore: AccountStore) => accountsStore.selectedWallet.address.length !== 0;
const haveAuthRequests = (extensionStore: ExtensionStore): number => extensionStore.authRequests.length;
const haveSignRequests = (extensionStore: ExtensionStore): number => extensionStore.signRequests.length;
const haveMetaRequests = (extensionStore: ExtensionStore): number => extensionStore.metaRequests.length;
const getStakingNetwork = async (stakingStore: StakingStore, network: NetworkName): Promise<NetworkParams> =>
  await new Promise((res) => setTimeout(() => res(stakingStore.getStakingNetwork(network)), 100));

export { getStakingNetwork, haveAuthRequests, hasSelectedWallet, haveMetaRequests, haveSignRequests };
