import { defineStore } from 'pinia';
import { LocalStorage } from '@/controllers/localStorageController';
import {
  applyRemoteDappSigningFlags,
  emptyDappSigningKillSwitchState,
  normalizeDappSigningKillSwitchState,
  type DappSigningKillSwitchState,
  type DappSigningVetoes,
} from '@/util/dappSigningKillSwitch';

const featureStorage = new LocalStorage('feature_');
const DAPP_SIGNING_KILL_SWITCH_KEY = 'dapp-signing-kill-switch-v1';

/**
 * The popup's copy of the remote dApp-signing kill switch, used to say on the signing screen that a family is paused
 * and to leave out Approve. The background applies the same rule before it signs. Like the send kill switch it is
 * kept apart from the extension store, so the signing screen can read it without pulling in the router.
 */
export const useDappSigningKillSwitchStore = defineStore('dappSigningKillSwitch', {
  state: (): { killSwitch: DappSigningKillSwitchState } => ({ killSwitch: emptyDappSigningKillSwitchState() }),
  getters: {
    vetoes: ({ killSwitch }): DappSigningVetoes => killSwitch.vetoes,
  },
  actions: {
    restoreRemembered() {
      try {
        this.killSwitch = normalizeDappSigningKillSwitchState(
          featureStorage.get<DappSigningKillSwitchState>(DAPP_SIGNING_KILL_SWITCH_KEY).value
        );
      } catch {
        this.killSwitch = emptyDappSigningKillSwitchState();
      }
    },
    applyRemoteConfig(raw: unknown) {
      this.killSwitch = applyRemoteDappSigningFlags(this.killSwitch, raw);

      try {
        featureStorage.set(DAPP_SIGNING_KILL_SWITCH_KEY, this.killSwitch as unknown as Record<string, unknown>);
      } catch {
        // The in-memory pause still applies; the next successful fetch retries.
      }
    },
  },
});
