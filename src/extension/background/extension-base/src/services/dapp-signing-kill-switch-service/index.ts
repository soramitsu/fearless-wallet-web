import { fetchRemoteFeatureConfig } from '@/util/remoteConfig';
import {
  applyRemoteDappSigningFlags,
  emptyDappSigningKillSwitchState,
  normalizeDappSigningKillSwitchState,
  type DappSigningFamily,
  type DappSigningKillSwitchState,
} from '@/util/dappSigningKillSwitch';

type DappSigningKillSwitchStorage = {
  read: () => Promise<DappSigningKillSwitchState | undefined>;
  write: (state: DappSigningKillSwitchState) => Promise<void>;
};

/**
 * The background's copy of the remote dApp-signing kill switch (`dappSigningKillSwitch.ts`), remembered in
 * `chrome.storage` under `dappSigningKillSwitch`. It follows SendKillSwitchService: a failed fetch keeps every
 * remembered pause, and with nothing remembered signing is allowed.
 */
export class DappSigningKillSwitchService {
  private state = emptyDappSigningKillSwitchState();
  private loaded?: Promise<void>;

  constructor(
    private readonly storage: DappSigningKillSwitchStorage,
    private readonly fetchRemoteConfig: () => Promise<unknown> = fetchRemoteFeatureConfig
  ) {}

  async init(): Promise<DappSigningKillSwitchState> {
    await this.ensureLoaded();

    let raw: unknown;

    try {
      raw = await this.fetchRemoteConfig();
    } catch {
      return this.state;
    }

    this.state = applyRemoteDappSigningFlags(this.state, raw);
    await this.storage
      .write(this.state)
      .catch((error) => console.warn('Failed to remember the dApp signing kill switch', error));

    return this.state;
  }

  /**
   * An approval can arrive while a cold-started service worker is still fetching the remote config, so the
   * remembered pauses are always read before answering.
   */
  async isSigningAllowed(family: DappSigningFamily): Promise<boolean> {
    await this.ensureLoaded();

    return !this.state.vetoes[family];
  }

  get snapshot(): DappSigningKillSwitchState {
    return this.state;
  }

  private ensureLoaded(): Promise<void> {
    this.loaded ??= this.storage
      .read()
      .then((stored) => {
        this.state = normalizeDappSigningKillSwitchState(stored);
      })
      .catch(() => {
        this.state = emptyDappSigningKillSwitchState();
      });

    return this.loaded;
  }
}

/**
 * Every dApp approval asks this before it touches a key or forwards the request to a mobile wallet. Test doubles of
 * State that do not model the kill switch allow signing, as a build with no remembered pause does.
 */
export async function isDappSigningAllowed(
  state: { dappSigningKillSwitchService?: Pick<DappSigningKillSwitchService, 'isSigningAllowed'> },
  family: DappSigningFamily
): Promise<boolean> {
  return (await state.dappSigningKillSwitchService?.isSigningAllowed(family)) ?? true;
}
