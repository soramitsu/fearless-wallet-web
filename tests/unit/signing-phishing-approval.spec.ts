import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ denied: vi.fn() }));
vi.mock('@polkadot/phishing', () => ({ checkIfDenied: mocks.denied }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));
import Extension from '@extension-base/background/handlers/Extension';
import type State from '@extension-base/background/handlers/State';

function fixture(protocol: 'substrate' | 'evm' | 'solana') {
  const queued = {
    id: 'public',
    url: 'https://public.example',
    account: { address: 'public-account' },
    resolve: vi.fn(),
    reject: vi.fn(),
    ...(protocol === 'evm'
      ? { data: [], method: 'personal_sign' }
      : protocol === 'solana'
        ? { ecosystem: 'solana', method: 'signMessage' }
        : { request: { payload: { data: '0x1234' }, sign: vi.fn() } }),
  };
  const state = {
    requestService: {
      getSignRequest: vi.fn(() => queued),
      evmRequestHandler: {
        claimEvmSignRequest: vi.fn(() => queued),
        getEvmSignRequest: vi.fn(() => queued),
        releaseEvmSignRequest: vi.fn(),
      },
    },
    keyringService: {
      getAllAccounts: vi.fn(() => []),
      accountExportPrivateKey: vi.fn(),
      exportMnemonic: vi.fn(),
      getPair: vi.fn(),
    },
    walletConnectDappService: { onRequest: vi.fn(), onEvmRequest: vi.fn() },
  };
  return { queued, state, extension: new Extension(state as unknown as State) };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.denied.mockResolvedValue(true);
});
describe('background signing phishing veto', () => {
  it.each(['substrate', 'evm', 'solana'] as const)(
    'blocks %s before any key access or mobile forwarding',
    async (protocol) => {
      const { queued, state, extension } = fixture(protocol);
      await extension.signingApprove({ id: 'public' }).catch(() => false);
      expect(mocks.denied).toHaveBeenCalledExactlyOnceWith('https://public.example');
      expect(queued.reject).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Signing requester is flagged as phishing' })
      );
      expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
      expect(state.keyringService.exportMnemonic).not.toHaveBeenCalled();
      expect(state.keyringService.getPair).not.toHaveBeenCalled();
      expect(state.walletConnectDappService.onRequest).not.toHaveBeenCalled();
      expect(state.walletConnectDappService.onEvmRequest).not.toHaveBeenCalled();
      expect(queued.resolve).not.toHaveBeenCalled();
    }
  );
  it.each(['substrate', 'evm'] as const)(
    'also blocks the external-signature completion route for %s',
    async (protocol) => {
      const { queued, extension } = fixture(protocol);
      await expect(extension.signingApproveSignature({ id: 'public', signature: '0x1234' })).rejects.toThrow(
        'phishing'
      );
      expect(queued.resolve).not.toHaveBeenCalled();
    }
  );
  it.each(['substrate', 'evm', 'solana'] as const)(
    'refuses a cancelled %s request after a delayed clean lookup',
    async (protocol) => {
      let finish!: (value: boolean) => void;
      mocks.denied.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        })
      );
      const { state, queued, extension } = fixture(protocol);
      const pending = extension.signingApprove({ id: 'public' }).catch(() => false);
      state.requestService.getSignRequest.mockReturnValue(undefined as never);
      finish(false);
      await pending;
      expect(queued.resolve).not.toHaveBeenCalled();
      expect(state.keyringService.getAllAccounts).not.toHaveBeenCalled();
      expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
    }
  );
  it.each(['substrate', 'solana'] as const)('claims %s approval before the asynchronous check', async (protocol) => {
    let finish!: (value: boolean) => void;
    mocks.denied.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const { extension } = fixture(protocol);
    const first = extension.signingApprove({ id: 'public' }).catch(() => false);
    await expect(extension.signingApprove({ id: 'public' })).rejects.toThrow('pending');
    expect(mocks.denied).toHaveBeenCalledTimes(1);
    finish(true);
    await first;
  });
});
