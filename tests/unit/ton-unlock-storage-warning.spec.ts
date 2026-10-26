import { describe, expect, it, vi } from 'vitest';
import Extension from '@extension-base/background/handlers/Extension';
import type State from '@extension-base/background/handlers/State';

vi.mock('@polkadot/phishing', () => ({ checkIfDenied: vi.fn(async () => false) }));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));

function fixture(unlocked: boolean, hasStorageIssues: boolean) {
  const keyringService = {
    unlockKeyring: vi.fn(() => unlocked),
    waitForPasswordVerifierUpgrade: vi.fn(async () => {}),
    tonKeyring: { hasStorageIssues, hasRecoveryAccounts: false },
    waitForAccessScan: vi.fn(() => new Promise<void>(() => {})),
  };
  const state = {
    keyringService,
    keyringLockService: { setExtensionAutoLockTimeout: vi.fn() },
  };
  return { keyringService, keyringLockService: state.keyringLockService, extension: new Extension(state as unknown as State) };
}

describe('unlock reports retained but unreadable TON storage', () => {
  it('keeps the verified session available and warns when TON records could not load', async () => {
    const { extension, keyringService } = fixture(true, true);
    await expect(extension.unlockKeyring({ password: 'public fixture password' })).resolves.toBe('ton-storage-unavailable');
    expect(keyringService.unlockKeyring).toHaveBeenCalledOnce();
    expect(keyringService.waitForAccessScan).not.toHaveBeenCalled();
  });

  it('does not claim a successful unlock when the password verifier rejects it', async () => {
    const { extension } = fixture(false, true);
    await expect(extension.unlockKeyring({ password: 'incorrect' })).resolves.toBe(false);
  });

  it('continues normally while earlier-password account recovery runs through the asynchronous banner', async () => {
    const { extension, keyringService } = fixture(true, false);
    keyringService.tonKeyring.hasRecoveryAccounts = true;
    await expect(extension.unlockKeyring({ password: 'public fixture password' })).resolves.toBe(true);
    expect(keyringService.waitForAccessScan).not.toHaveBeenCalled();
  });

  it('waits for durable verifier migration before acknowledging and starting the session timer', async () => {
    const { extension, keyringService, keyringLockService } = fixture(true, false);
    let finish!: () => void;
    keyringService.waitForPasswordVerifierUpgrade.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const result = extension.unlockKeyring({ password: 'public fixture password' });
    expect(keyringLockService.setExtensionAutoLockTimeout).not.toHaveBeenCalled();
    finish();
    await expect(result).resolves.toBe(true);
    expect(keyringLockService.setExtensionAutoLockTimeout).toHaveBeenCalledOnce();
  });

  it('does not acknowledge or extend a session after verifier storage fails', async () => {
    const { extension, keyringService, keyringLockService } = fixture(true, false);
    keyringService.waitForPasswordVerifierUpgrade.mockRejectedValue(new Error('Storage failed'));
    await expect(extension.unlockKeyring({ password: 'public fixture password' })).rejects.toThrow('Storage failed');
    expect(keyringLockService.setExtensionAutoLockTimeout).not.toHaveBeenCalled();
  });
});
