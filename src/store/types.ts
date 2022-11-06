import type { ModuleTree } from 'vuex';
import type { State as NetworksState } from '@/store/networks/state';
import type { State as AccountState } from '@/store/accounts/state';
import type { State as ExtensionState } from '@/store/extension/state';
import type { State as BeaconState } from '@/store/beacon/state';

type ModulesTypes = NetworksState & AccountState & ExtensionState & BeaconState;
type Modules = ModuleTree<ModulesTypes>;

export default Modules;
