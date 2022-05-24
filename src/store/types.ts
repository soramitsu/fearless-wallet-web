import { ModuleTree } from 'vuex';
import { State as NetworksState } from './networks/state';
import { State as AccountState } from './accounts/state';

type ModulesTypes = NetworksState & AccountState;
type Modules = ModuleTree<ModulesTypes>;

export default Modules;
