import {
  SORA_DISCLAIMER_VERSION,
  type SoraDisclaimerAcceptance,
  type SoraDisclaimerStatus,
} from '@/defi/soraDisclaimer';

type SoraDisclaimerStorage = {
  read: () => Promise<SoraDisclaimerAcceptance | undefined>;
  write: (acceptance: SoraDisclaimerAcceptance) => Promise<void>;
};

const validAcceptance = (
  value: SoraDisclaimerAcceptance | undefined,
  currentVersion: number
): value is SoraDisclaimerAcceptance =>
  Boolean(
    value &&
      value.version === currentVersion &&
      Number.isFinite(value.acceptedAt) &&
      value.acceptedAt > 0
  );

export class SoraDisclaimerService {
  private acceptance?: SoraDisclaimerAcceptance;

  constructor(
    private readonly storage: SoraDisclaimerStorage,
    private readonly currentVersion = SORA_DISCLAIMER_VERSION,
    private readonly now = Date.now
  ) {}

  async init(): Promise<SoraDisclaimerStatus> {
    const stored = await this.storage.read();
    this.acceptance = validAcceptance(stored, this.currentVersion) ? stored : undefined;
    return this.status;
  }

  async accept(version: number): Promise<SoraDisclaimerStatus> {
    if (version !== this.currentVersion) return this.status;

    const acceptance = { version: this.currentVersion, acceptedAt: this.now() };
    if (!validAcceptance(acceptance, this.currentVersion)) return this.status;
    await this.storage.write(acceptance);
    this.acceptance = acceptance;
    return this.status;
  }

  isAccepted(): boolean {
    return validAcceptance(this.acceptance, this.currentVersion);
  }

  get status(): SoraDisclaimerStatus {
    return {
      version: this.currentVersion,
      accepted: this.isAccepted(),
      ...(this.acceptance ? { acceptedAt: this.acceptance.acceptedAt } : {}),
    };
  }
}
