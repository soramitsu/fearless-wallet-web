import type { ModuleTree } from 'vuex';
import type { State as NetworksState } from '@/store/networks/state';
import type { State as AccountState } from '@/store/accounts/state';
import type { State as ExtensionState } from '@/store/extension/state';
import type { State as SoraCardState } from '@/store/soraCard/state';
import type { State as StakingState } from '@/store/staking/state';
import type { State as PoolsState } from '@/store/pools/state';

type ModulesTypes = NetworksState & AccountState & ExtensionState & SoraCardState & StakingState & PoolsState;
type Modules = ModuleTree<ModulesTypes>;

export default Modules;
