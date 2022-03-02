import { ModuleTree } from 'vuex';
import { State as ApiState } from './api/state';

type ModulesTypes = ApiState; // example ApiState || ExampleOneState || ExampleTwoState
type Modules = ModuleTree<ModulesTypes>;

export default Modules;
