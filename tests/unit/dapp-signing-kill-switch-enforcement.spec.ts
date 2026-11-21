import { Wallet, getBytes, hexlify, toUtf8Bytes, verifyMessage } from 'ethers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ denied: vi.fn(), validateEvm: vi.fn(), validateWalletConnect: vi.fn() }));
vi.mock('@polkadot/phishing', () => ({ checkIfDenied: mocks.denied }));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
// Extension is exercised with a State double; its services are never built.
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));
// The signing contexts are validated by their own specs; here they only have to pass.
vi.mock('@extension-base/services/request-service/handlers/evmSigningContext', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  validateEvmSigningContext: mocks.validateEvm,
}));
vi.mock('@extension-base/services/wallet-connect-service/signingContext', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  validateWalletConnectSigningContext: mocks.validateWalletConnect,
}));

import Extension from '@extension-base/background/handlers/Extension';
import EvmRequestHandler from '@extension-base/services/request-service/handlers/EvmRequestHandler';
import { DappSigningKillSwitchService } from '@extension-base/services/dapp-signing-kill-switch-service';
import { EipService } from '@extension-base/services/eip-service';
import type State from '@extension-base/background/handlers/State';
import type { HexString } from '@polkadot/util/types';
import type { WcSessionRequestEvent } from '@extension-base/services/wallet-connect-service/protocol/types';
import type { WalletConnectSigningContext } from '@extension-base/services/wallet-connect-service/types';
import { DAPP_SIGNING_FAMILIES, type DappSigningFamily } from '@/util/dappSigningKillSwitch';
import { CURRENT_WALLET_SECURITY_GENERATION } from '@/util/walletSecurity';

// Public test key only; never fund it.
const signer = new Wallet(`0x${'11'.repeat(32)}`);
const message = hexlify(toUtf8Bytes('Sign in to dapp.example'));
const MOBILE_KEYS: Readonly<Record<DappSigningFamily, string>> = {
  polkadot: 'polkadot_dapp_signing_enabled',
  evm: 'evm_dapp_signing_enabled',
  solana: 'solana_dapp_signing_enabled',
  ton: 'ton_dapp_signing_enabled',
};

// The remote config the background fetched: `false` pauses those families, `true` keeps them on.
async function killSwitch(flags: Record<string, boolean> = {}) {
  const featureToggle = Object.fromEntries(
    Object.entries(flags).map(([family, value]) => [MOBILE_KEYS[family as DappSigningFamily], value])
  );
  const service = new DappSigningKillSwitchService(
    { read: async () => undefined, write: async () => undefined },
    async () => ({ feature_toggle: featureToggle })
  );
  await service.init();
  return service;
}

const pausedExcept = (family: DappSigningFamily) =>
  killSwitch(Object.fromEntries(DAPP_SIGNING_FAMILIES.filter((other) => other !== family).map((other) => [other, false])));

function keyringService() {
  return {
    tonKeyring: { getAccounts: () => [] },
    getAllAccounts: vi.fn(() => [
      { address: signer.address, meta: { walletSecurityGeneration: CURRENT_WALLET_SECURITY_GENERATION } },
    ]),
    accountExportPrivateKey: vi.fn(() => ({ privateKey: signer.privateKey })),
    exportMnemonic: vi.fn(),
    getPair: vi.fn(),
    getPassword: vi.fn(),
    unlockPair: vi.fn(),
    getSubstrateAddress: vi.fn((address: string) => address),
    getEthereumAddress: vi.fn((address: string) => address),
  };
}

// Key use or mobile forwarding of any kind; none may happen once a family is paused.
function expectNoKeyUse(state: ReturnType<typeof queueFixture>['state'] | ReturnType<typeof evmFixture>['state']) {
  expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
  expect(state.keyringService.exportMnemonic).not.toHaveBeenCalled();
  expect(state.keyringService.getPair).not.toHaveBeenCalled();
  expect(state.keyringService.getPassword).not.toHaveBeenCalled();
  expect(state.walletConnectDappService.onRequest).not.toHaveBeenCalled();
  expect(state.walletConnectDappService.onEvmRequest).not.toHaveBeenCalled();
}

// Substrate (polkadot-js signPayload/signRaw and WalletConnect `polkadot_*`) and Solana queue entries. As in the
// real queues, a settled request leaves its queue.
function queueFixture(protocol: 'substrate' | 'solana', service?: DappSigningKillSwitchService, walletConnect = false) {
  let current: Record<string, unknown> | undefined;
  const sign = vi.fn();
  const queued = {
    id: `${protocol}.request`,
    url: 'https://dapp.example',
    account: { address: signer.address, publicKey: signer.address, name: 'Wallet' },
    resolve: vi.fn(() => {
      current = undefined;
    }),
    reject: vi.fn(() => {
      current = undefined;
    }),
    ...(protocol === 'solana'
      ? { ecosystem: 'solana', method: 'signMessage', origin: 'https://dapp.example' }
      : {
          request: { payload: { address: signer.address, data: '0x1234', type: 'bytes' }, sign },
          ...(walletConnect ? { walletConnectContext: { origin: 'wc:topic' } } : {}),
        }),
  };
  current = queued;
  const state = {
    dappSigningKillSwitchService: service,
    requestService: {
      getSignRequest: vi.fn(() => current),
      authRequestHandler: { assertSigningAuthorization: vi.fn() },
    },
    keyringService: keyringService(),
    walletConnectDappService: { onRequest: vi.fn(), onEvmRequest: vi.fn() },
    getEvmApi: vi.fn(),
  };
  return { queued, sign, state, extension: new Extension(state as unknown as State) };
}

// Injected EVM requests (eth_sign, personal_sign, eth_signTypedData*, eth_sendTransaction) and WalletConnect
// `eip155` requests in the real EvmRequestHandler queues.
function evmFixture(service?: DappSigningKillSwitchService) {
  const queueOwner = { keyringService: { isResetting: false }, hasSigningRequest: () => false, updateIcon: vi.fn(), popupOpen: vi.fn() };
  const handler = new EvmRequestHandler(queueOwner as never);
  const state = {
    dappSigningKillSwitchService: service,
    requestService: {
      evmRequestHandler: handler,
      getSignRequest: vi.fn((id: string) => handler.getEvmSignRequest(id)),
    },
    keyringService: keyringService(),
    walletConnectDappService: { onRequest: vi.fn(), onEvmRequest: vi.fn() },
    getEvmApi: vi.fn(),
  };
  const network = { name: 'Ethereum', chainId: '1', genesisHash: '0x01' };
  const queue = (id: string, method = 'personal_sign', isMobile = false) => {
    const result = handler.confirmSign(id, 'https://dapp.example', method, [message, signer.address], {
      authorizationRevision: 1,
      account: { address: signer.address, name: 'Wallet', isMobile },
      network,
    });
    result.catch(() => undefined);
    return result;
  };
  const queueWalletConnect = () => {
    const event: WcSessionRequestEvent = {
      id: 7,
      topic: 'wc-topic',
      params: { chainId: 'eip155:1', request: { method: 'personal_sign', params: [message, signer.address] } },
      verifyContext: { verified: { origin: 'https://wc.example', validation: 'UNKNOWN', verifyUrl: '' } },
    };
    const context: WalletConnectSigningContext = {
      account: { address: signer.address, name: 'Wallet', isMobile: false },
      network,
      session: { topic: 'wc-topic', peerPublicKey: '00', origin: 'https://wc.example', revision: 1 },
    };
    mocks.validateWalletConnect.mockReturnValue(context);
    const result = handler.onWCSign(event, context);
    result.catch(() => undefined);
    const queued = handler.allWcSignRequests;
    const { approvalId } = queued[queued.length - 1];
    return { result, approvalId };
  };
  return { handler, state, queue, queueWalletConnect, extension: new Extension(state as unknown as State) };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.denied.mockResolvedValue(false);
});

describe('Polkadot and Solana dApp signing kill switch', () => {
  it.each([
    ['substrate', 'polkadot', false],
    ['substrate', 'polkadot', true],
    ['solana', 'solana', false],
  ] as const)('refuses a paused %s request (%s family, WalletConnect %s) before any key is used', async (protocol, family, wc) => {
    const { queued, sign, state, extension } = queueFixture(protocol, await killSwitch({ [family]: false }), wc);

    await expect(extension.signingApprove({ id: queued.id, kind: protocol })).rejects.toThrow(
      `dapp_signing_paused:${family}`
    );

    // The dApp gets what the person's Reject sends it.
    expect(queued.reject).toHaveBeenCalledOnce();
    expect(queued.reject).toHaveBeenCalledWith(new Error('Cancelled'));
    expect(queued.resolve).not.toHaveBeenCalled();
    // The switch is read after the phishing lookup and before the signing authorization and any key.
    expect(mocks.denied).toHaveBeenCalledOnce();
    expect(state.requestService.authRequestHandler.assertSigningAuthorization).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
    expectNoKeyUse(state);
  });

  it.each([
    ['substrate', 'polkadot'],
    ['solana', 'solana'],
  ] as const)('ends a paused %s request with the same error as Reject', async (protocol, family) => {
    const vetoed = queueFixture(protocol, await killSwitch({ [family]: false }));
    const rejected = queueFixture(protocol);

    await vetoed.extension.signingApprove({ id: vetoed.queued.id, kind: protocol }).catch(() => undefined);
    rejected.extension.signingCancel({ id: rejected.queued.id, kind: protocol });

    expect(vetoed.queued.reject.mock.calls).toEqual(rejected.queued.reject.mock.calls);
  });

  it.each([
    ['substrate', 'polkadot', undefined],
    ['substrate', 'polkadot', true],
    ['solana', 'solana', undefined],
    ['solana', 'solana', true],
  ] as const)('lets a %s request through when the %s flag is %s', async (protocol, family, flag) => {
    const { queued, state, extension } = queueFixture(protocol, await killSwitch(flag === undefined ? {} : { [family]: flag }));
    // The next check after the kill switch is the site's signing authorization; stop the approval there.
    const next = new Error('next check reached');
    state.requestService.authRequestHandler.assertSigningAuthorization.mockImplementation(() => {
      throw next;
    });

    await expect(extension.signingApprove({ id: queued.id, kind: protocol })).resolves.toBe(false);

    expect(mocks.denied).toHaveBeenCalledExactlyOnceWith('https://dapp.example');
    expect(state.requestService.authRequestHandler.assertSigningAuthorization).toHaveBeenCalledOnce();
    expect(queued.reject).toHaveBeenCalledExactlyOnceWith(next);
    expectNoKeyUse(state);
  });

  it.each([
    ['substrate', 'polkadot'],
    ['solana', 'solana'],
  ] as const)('is not paused by any other family for %s', async (protocol, family) => {
    const { queued, state, extension } = queueFixture(protocol, await pausedExcept(family));
    const next = new Error('next check reached');
    state.requestService.authRequestHandler.assertSigningAuthorization.mockImplementation(() => {
      throw next;
    });

    await expect(extension.signingApprove({ id: queued.id, kind: protocol })).resolves.toBe(false);

    expect(state.requestService.authRequestHandler.assertSigningAuthorization).toHaveBeenCalledOnce();
    expect(queued.reject).toHaveBeenCalledExactlyOnceWith(next);
  });

  it('leaves a flagged site to the phishing refusal', async () => {
    mocks.denied.mockResolvedValue(true);
    const { queued, state, extension } = queueFixture('substrate', await killSwitch({ polkadot: false }));

    await expect(extension.signingApprove({ id: queued.id, kind: 'substrate' })).resolves.toBe(false);

    expect(queued.reject).toHaveBeenCalledExactlyOnceWith(new Error('Signing requester is flagged as phishing'));
    expectNoKeyUse(state);
  });

  it('also refuses a paused Solana sign-and-send that the send switch allows', async () => {
    const { queued, state, extension } = queueFixture('solana', await killSwitch({ solana: false }));
    Object.assign(queued, { method: 'signAndSendTransaction', transactionBase64: 'AA==' });

    await expect(extension.signingApprove({ id: queued.id, kind: 'solana' })).rejects.toThrow('dapp_signing_paused:solana');
    expect(queued.reject).toHaveBeenCalledWith(new Error('Cancelled'));
    expectNoKeyUse(state);
  });

  it('refuses to deliver an external Polkadot signature while paused', async () => {
    const { queued, state, extension } = queueFixture('substrate', await killSwitch({ polkadot: false }));

    await expect(
      extension.signingApproveSignature({ id: queued.id, signature: `0x${'01'.repeat(64)}`, kind: 'substrate' })
    ).rejects.toThrow('dapp_signing_paused:polkadot');

    expect(queued.resolve).not.toHaveBeenCalled();
    expect(queued.reject).toHaveBeenCalledWith(new Error('Cancelled'));
    expect(state.requestService.authRequestHandler.assertSigningAuthorization).not.toHaveBeenCalled();
    expectNoKeyUse(state);
  });
});

describe('EVM dApp signing kill switch', () => {
  it.each(['personal_sign', 'eth_sign', 'eth_signTypedData_v4', 'eth_sendTransaction'])(
    'refuses a paused injected %s before any key is used',
    async (method) => {
      const { handler, state, queue, extension } = evmFixture(await killSwitch({ evm: false }));
      const result = queue('evm.request', method);

      await expect(extension.signingApprove({ id: 'evm.request', kind: 'evm' })).rejects.toThrow('dapp_signing_paused:evm');

      // The page's eth request ends as a Reject ends it, and the queue is empty.
      await expect(result).rejects.toThrow(/^Cancelled$/);
      expect(handler.getEvmSignRequest('evm.request')).toBeUndefined();
      // Read after the phishing lookup, before the signing context is checked again and before any key.
      expect(mocks.denied).toHaveBeenCalledExactlyOnceWith('https://dapp.example');
      expect(mocks.validateEvm).not.toHaveBeenCalled();
      expectNoKeyUse(state);
    }
  );

  it('ends a paused injected request with the same error as Reject', async () => {
    const { queue, extension } = evmFixture(await killSwitch({ evm: false }));
    const vetoed = queue('evm.vetoed');
    const rejected = queue('evm.rejected');

    await extension.signingApprove({ id: 'evm.vetoed', kind: 'evm' }).catch(() => undefined);
    extension.signingCancel({ id: 'evm.rejected', kind: 'evm' });

    const [vetoedError, rejectedError] = await Promise.all([vetoed.catch((e) => e), rejected.catch((e) => e)]);
    expect(vetoedError).toEqual(rejectedError);
  });

  it('never asks a paired mobile wallet to sign while paused', async () => {
    const { state, queue, extension } = evmFixture(await killSwitch({ evm: false }));
    const result = queue('evm.mobile', 'personal_sign', true);

    await expect(extension.signingApprove({ id: 'evm.mobile', kind: 'evm' })).rejects.toThrow('dapp_signing_paused:evm');
    await expect(result).rejects.toThrow('Cancelled');
    expectNoKeyUse(state);
  });

  it('refuses to deliver an external EVM signature while paused', async () => {
    const { queue, extension } = evmFixture(await killSwitch({ evm: false }));
    const result = queue('evm.external');

    await expect(
      extension.signingApproveSignature({ id: 'evm.external', signature: `0x${'01'.repeat(65)}`, kind: 'evm' })
    ).rejects.toThrow('dapp_signing_paused:evm');
    await expect(result).rejects.toThrow('Cancelled');
    expect(mocks.validateEvm).not.toHaveBeenCalled();
  });

  it.each([
    ['nothing published', {}],
    ['evm explicitly on', { evm: true }],
    ['every other family paused', { polkadot: false, solana: false, ton: false }],
  ] as const)('signs an injected personal_sign with %s', async (_label, flags) => {
    const { state, queue, extension } = evmFixture(await killSwitch(flags));
    const result = queue('evm.allowed');

    await expect(extension.signingApprove({ id: 'evm.allowed', kind: 'evm' })).resolves.toBe(true);

    const { payload } = await result;
    expect(verifyMessage(getBytes(message), payload as HexString)).toBe(signer.address);
    expect(state.keyringService.accountExportPrivateKey).toHaveBeenCalledExactlyOnceWith({ address: signer.address });
  });

  it('signs for a State double that does not model the switch', async () => {
    const { queue, extension } = evmFixture(undefined);
    const result = queue('evm.unmodelled');

    await expect(extension.signingApprove({ id: 'evm.unmodelled', kind: 'evm' })).resolves.toBe(true);
    await expect(result).resolves.toMatchObject({ id: 'evm.unmodelled' });
  });
});

describe('WalletConnect eip155 kill switch', () => {
  it('refuses a paused request after the phishing lookup and before any key is used', async () => {
    const { handler, state, queueWalletConnect, extension } = evmFixture(await killSwitch({ evm: false }));
    const { result, approvalId } = queueWalletConnect();

    await expect(extension.wcRequestApprove({ address: signer.address, approvalId })).rejects.toThrow(
      'dapp_signing_paused:evm'
    );

    // Eip155RequestHandler answers the dApp with this message, as it answers the person's Reject.
    await expect(result).rejects.toThrow(/^USER_REJECTED$/);
    expect(handler.getSignWCRequest(approvalId)).toBeUndefined();
    // The captured context is validated once, before the lookup; the re-check that follows the switch never runs.
    expect(mocks.validateWalletConnect).toHaveBeenCalledOnce();
    expect(mocks.denied).toHaveBeenCalledExactlyOnceWith('https://wc.example');
    expectNoKeyUse(state);
  });

  it('ends a paused request with the same error as Reject', async () => {
    const { handler, queueWalletConnect, extension } = evmFixture(await killSwitch({ evm: false }));
    const vetoed = queueWalletConnect();

    await extension.wcRequestApprove({ address: signer.address, approvalId: vetoed.approvalId }).catch(() => undefined);
    const rejected = queueWalletConnect();
    handler.rejectWCSignRequest(rejected.approvalId);

    const [vetoedError, rejectedError] = await Promise.all([
      vetoed.result.catch((e) => e),
      rejected.result.catch((e) => e),
    ]);
    expect(vetoedError).toEqual(rejectedError);
  });

  it.each([
    ['nothing published', {}],
    ['evm explicitly on', { evm: true }],
    ['every other family paused', { polkadot: false, solana: false, ton: false }],
  ] as const)('signs a personal_sign with %s', async (_label, flags) => {
    const { state, queueWalletConnect, extension } = evmFixture(await killSwitch(flags));
    const { result, approvalId } = queueWalletConnect();

    await expect(extension.wcRequestApprove({ address: signer.address, approvalId })).resolves.toBe(true);

    const { id, payload } = await result;
    expect(id).toBe('wc-topic');
    expect(verifyMessage(getBytes(message), payload as HexString)).toBe(signer.address);
    expect(state.keyringService.accountExportPrivateKey).toHaveBeenCalledOnce();
  });
});

describe('connecting and reading while every family is paused', () => {
  it('still answers EVM account, chain and permission requests', async () => {
    const authorizeUrl = vi.fn(async () => true);
    const state = {
      dappSigningKillSwitchService: await killSwitch({ polkadot: false, evm: false, solana: false, ton: false }),
      getAuthInfo: vi.fn(async () => ({ isAllowed: true, evmAuthorizedAccount: signer.address })),
      requestService: { authorizeUrl, getEvmNetworkInfo: () => ({ name: 'Ethereum', chainId: '1' }) },
      networkService: { evmApiHandler: { api: {} } },
    };
    const eip = new EipService(state as unknown as State);
    const url = 'https://dapp.example';

    await expect(eip.handleEvmRequest('1', url, { method: 'wallet_requestPermissions', params: {} })).resolves.toEqual([
      expect.objectContaining({ parentCapability: 'eth_accounts', caveats: [expect.objectContaining({ value: [signer.address] })] }),
    ]);
    await expect(eip.handleEvmRequest('2', url, { method: 'eth_accounts' })).resolves.toEqual([signer.address]);
    await expect(eip.handleEvmRequest('3', url, { method: 'eth_chainId' })).resolves.toBe('0x01');
    expect(authorizeUrl).toHaveBeenCalledOnce();
  });
});
