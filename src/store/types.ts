import { ModuleTree } from 'vuex';
import { State as ApiState } from './networks/state';
import { State as AccountState } from './accounts/state';

type ModulesTypes = ApiState & AccountState;
type Modules = ModuleTree<ModulesTypes>;

export default Modules;
