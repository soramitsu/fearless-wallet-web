import axios from 'axios';
import { URLS } from '@/consts/urls';
import { isBitcoinTransfersEnabled, isSolanaTransfersEnabled } from '@/util/releaseFeatures';
import {
  applyRemoteSendFlags,
  emptySendKillSwitchState,
  normalizeSendKillSwitchState,
  type SendCapability,
  type SendKillSwitchState,
} from '@/util/sendKillSwitch';

type SendKillSwitchStorage = {
  read: () => Promise<SendKillSwitchState | undefined>;
  write: (state: SendKillSwitchState) => Promise<void>;
};

const DISABLED_ERRORS: Readonly<Record<SendCapability, string>> = Object.freeze({
  bitcoinSend: 'bitcoin_transfer_disabled',
  solanaSend: 'solana_transfer_disabled',
});

export const isSendCapabilityCompiledOn = (capability: SendCapability): boolean =>
  capability === 'bitcoinSend' ? isBitcoinTransfersEnabled() : isSolanaTransfersEnabled();

export class SendKillSwitchService {
  private state = emptySendKillSwitchState();
  private loaded?: Promise<void>;

  constructor(
    private readonly storage: SendKillSwitchStorage,
    private readonly fetchRemoteConfig: () => Promise<unknown> = async () => (await axios.get<unknown>(URLS.FEATURES)).data
  ) {}

  async init(): Promise<SendKillSwitchState> {
    await this.ensureLoaded();

    let raw: unknown;

    try {
      raw = await this.fetchRemoteConfig();
    } catch {
      // A failed fetch keeps every remembered veto; with nothing remembered the
      // compiled default applies.
      return this.state;
    }

    this.state = applyRemoteSendFlags(this.state, raw);
    await this.storage.write(this.state).catch((error) => console.warn('Failed to remember send kill switch', error));

    return this.state;
  }

  /**
   * A send can arrive while a cold-started service worker is still fetching the
   * remote config, so the remembered vetoes are always read before answering.
   */
  async isSendEnabled(capability: SendCapability): Promise<boolean> {
    await this.ensureLoaded();

    return isSendCapabilityCompiledOn(capability) && !this.state.vetoes[capability];
  }

  async assertSendEnabled(capability: SendCapability): Promise<void> {
    if (!(await this.isSendEnabled(capability))) throw new Error(DISABLED_ERRORS[capability]);
  }

  get snapshot(): SendKillSwitchState {
    return this.state;
  }

  private ensureLoaded(): Promise<void> {
    this.loaded ??= this.storage
      .read()
      .then((stored) => {
        this.state = normalizeSendKillSwitchState(stored);
      })
      .catch(() => {
        this.state = emptySendKillSwitchState();
      });

    return this.loaded;
  }
}

/**
 * Background send entry points call this before touching keys. Test doubles of
 * State that do not model the kill switch still honour the compile-time flag.
 */
export async function assertSendCapability(
  state: { sendKillSwitchService?: Pick<SendKillSwitchService, 'assertSendEnabled'> },
  capability: SendCapability
): Promise<void> {
  if (!isSendCapabilityCompiledOn(capability)) throw new Error(DISABLED_ERRORS[capability]);

  await state.sendKillSwitchService?.assertSendEnabled(capability);
}
