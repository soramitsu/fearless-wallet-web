import type { ModuleTree } from 'vuex';
import type { State as NetworksState } from './networks/state';
import type { State as AccountState } from './accounts/state';

type ModulesTypes = NetworksState & AccountState;
type Modules = ModuleTree<ModulesTypes>;

export default Modules;
