import { describe, expect, it, vi } from 'vitest';
import { SoraDisclaimerService } from '@extension-base/services/sora-disclaimer-service';
import { SORA_DISCLAIMER_VERSION, type SoraDisclaimerAcceptance } from '@/defi/soraDisclaimer';

describe('SoraDisclaimerService', () => {
  it('fails closed until the current version is persisted by the background service', async () => {
    let stored: SoraDisclaimerAcceptance | undefined;
    const write = vi.fn(async (value: SoraDisclaimerAcceptance) => {
      stored = value;
    });
    const service = new SoraDisclaimerService(
      { read: async () => stored, write },
      SORA_DISCLAIMER_VERSION,
      () => 1_000
    );

    await expect(service.init()).resolves.toEqual({ accepted: false, version: SORA_DISCLAIMER_VERSION });
    expect(service.isAccepted()).toBe(false);
    await expect(service.accept(SORA_DISCLAIMER_VERSION + 1)).resolves.toEqual({
      accepted: false,
      version: SORA_DISCLAIMER_VERSION,
    });
    expect(write).not.toHaveBeenCalled();

    await expect(service.accept(SORA_DISCLAIMER_VERSION)).resolves.toEqual({
      accepted: true,
      acceptedAt: 1_000,
      version: SORA_DISCLAIMER_VERSION,
    });
    expect(service.isAccepted()).toBe(true);
    expect(stored).toEqual({ acceptedAt: 1_000, version: SORA_DISCLAIMER_VERSION });
  });

  it('treats cleared storage and a version bump as unaccepted', async () => {
    let stored: SoraDisclaimerAcceptance | undefined = {
      acceptedAt: 1_000,
      version: SORA_DISCLAIMER_VERSION,
    };
    const storage = {
      read: async () => stored,
      write: async (value: SoraDisclaimerAcceptance) => {
        stored = value;
      },
    };
    const bumped = new SoraDisclaimerService(storage, SORA_DISCLAIMER_VERSION + 1);

    await expect(bumped.init()).resolves.toEqual({
      accepted: false,
      version: SORA_DISCLAIMER_VERSION + 1,
    });
    stored = undefined;
    const reset = new SoraDisclaimerService(storage, SORA_DISCLAIMER_VERSION);
    await expect(reset.init()).resolves.toEqual({ accepted: false, version: SORA_DISCLAIMER_VERSION });
  });
});
