import { defineStore } from 'pinia';
import { LocalStorage } from '@/controllers/localStorageController';
import {
  applyRemoteSendFlags,
  emptySendKillSwitchState,
  normalizeSendKillSwitchState,
  type SendCapabilityVetoes,
  type SendKillSwitchState,
} from '@/util/sendKillSwitch';

const featureStorage = new LocalStorage('feature_');
const SEND_KILL_SWITCH_KEY = 'send-kill-switch-v1';

/**
 * The popup's copy of the veto-only Bitcoin/Solana send kill switch, used to
 * hide a vetoed send. The background applies the same rule before it touches
 * keys. Kept apart from the extension store so send screens can read it
 * without pulling in the router.
 */
export const useSendKillSwitchStore = defineStore('sendKillSwitch', {
  state: (): { killSwitch: SendKillSwitchState } => ({ killSwitch: emptySendKillSwitchState() }),
  getters: {
    vetoes: ({ killSwitch }): SendCapabilityVetoes => killSwitch.vetoes,
  },
  actions: {
    restoreRemembered() {
      try {
        this.killSwitch = normalizeSendKillSwitchState(featureStorage.get<SendKillSwitchState>(SEND_KILL_SWITCH_KEY).value);
      } catch {
        this.killSwitch = emptySendKillSwitchState();
      }
    },
    applyRemoteConfig(raw: unknown) {
      this.killSwitch = applyRemoteSendFlags(this.killSwitch, raw);

      try {
        featureStorage.set(SEND_KILL_SWITCH_KEY, this.killSwitch as unknown as Record<string, unknown>);
      } catch {
        // The in-memory veto still applies; the next successful fetch retries.
      }
    },
  },
});
