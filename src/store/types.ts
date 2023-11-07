import type { ModuleTree } from 'vuex';
import type { State as NetworksState } from '@/store/networks/state';
import type { State as AccountState } from '@/store/accounts/state';
import type { State as ExtensionState } from '@/store/extension/state';
import type { State as SoraCardState } from '@/store/soraCard/state';
import type { State as StakingState } from '@/store/staking/state';

type ModulesTypes = NetworksState & AccountState & ExtensionState & SoraCardState & StakingState;
type Modules = ModuleTree<ModulesTypes>;

export default Modules;
