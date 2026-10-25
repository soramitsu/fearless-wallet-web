import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Extension from '@extension-base/background/handlers/Extension';
import type State from '@extension-base/background/handlers/State';

const { quoteSolanaTransfer, resolveSolanaSignAndSendTransaction, resolveSolanaSigning } = vi.hoisted(() => ({
  quoteSolanaTransfer: vi.fn(),
  resolveSolanaSignAndSendTransaction: vi.fn(),
  resolveSolanaSigning: vi.fn(),
}));

// Only the Solana paths are exercised; the other transfer back ends are kept out.
vi.mock('@/consts/global', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/consts/global')>()),
  IS_EXTENSION: false,
  IS_EXTENSION_SMOKE: false,
}));
vi.mock('@/sora', () => ({}));
vi.mock('@extension-base/api/evm/transfer', () => ({}));
vi.mock('@extension-base/api/bitcoin/transfer', () => ({ isBitcoinTransferNetwork: () => false }));
vi.mock('@extension-base/api/iroha/transfer', () => ({ isIrohaTransferNetwork: () => false }));
vi.mock('@extension-base/api/iroha/productionTransferCodec', () => ({}));
vi.mock('@extension-base/api/solana/transfer', () => ({
  isSolanaTransferNetwork: (network?: { ecosystem?: string }) => network?.ecosystem === 'solana',
  quoteSolanaTransfer,
}));
vi.mock('@extension-base/api/substrate/transfer', () => ({}));
vi.mock('@extension-base/api/substrate/sora', () => ({}));
vi.mock('@extension-base/api/substrate/crossChain', () => ({}));
vi.mock('@extension-base/api/substrate/typeRegistry', () => ({}));
vi.mock('@extension-base/api/ton/transfer', () => ({}));
vi.mock('@extension-base/services/wallet-connect-service/utils', () => ({}));
vi.mock('@extension-base/services/wallet-connect-service/consts', () => ({}));
vi.mock('@extension-base/services/request-service/handlers/solanaSigning', () => ({
  resolveSolanaSignAndSendTransaction,
  resolveSolanaSigning,
}));
vi.mock('@extension-base/services/polkamarkt-service', () => ({}));
vi.mock('@extension-base/background/helpers/balance', () => ({}));
vi.mock('@extension-base/background/helpers', () => ({}));
vi.mock('@extension-base/background/handlers/utils', () => ({}));
vi.mock('@/helpers', () => ({}));
vi.mock('@/consts/currencies', () => ({}));
vi.mock('@/consts/networks', () => ({}));
vi.mock('@/cross-chain/requestValidation', () => ({}));
vi.mock('@/defi/polkaswapExecutionGuard', () => ({}));
vi.mock('@extension-base/const', () => ({}));
vi.mock('@extension-base/background/handlers/ExtensionBase', () => ({
  default: class {
    constructor(protected state: State) {}
  },
}));

const WALLET = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';

const originalSolanaFlag = process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS = 'true';
});

afterEach(() => {
  if (originalSolanaFlag === undefined) delete process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS;
  else process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS = originalSolanaFlag;
});

describe('Solana quote request', () => {
  const quoteWith = async (extra: Record<string, unknown>) => {
    const state = {
      keyringService: { isResetting: false },
      networkService: { networkMap: { Solana: { ecosystem: 'solana' } } },
    } as unknown as State;

    quoteSolanaTransfer.mockResolvedValue({ fee: '0.000006', maxSendable: '12.5' });
    await new Extension(state).handle('test', 'pri(accounts.checkTransfer)', {
      amount: '12.5',
      assetId: 'SOL',
      from: 'stored-account',
      networkKey: 'Solana',
      to: WALLET,
      ...extra,
    } as never);

    return quoteSolanaTransfer.mock.calls[0][0];
  };

  it("prices the quote at the priority fee the Send screen asks for, so the price does not move under a repricing", async () => {
    const params = await quoteWith({ solanaComputeUnitPriceMicroLamports: 1_000 });

    expect(params).toMatchObject({ amount: '12.5', networkKey: 'Solana', solanaComputeUnitPriceMicroLamports: 1_000 });
  });

  it('prices the network afresh when the screen asks for no particular fee', async () => {
    const params = await quoteWith({});

    expect(params.solanaComputeUnitPriceMicroLamports).toBeUndefined();
  });
});

describe('dApp sign-and-send under the send kill switch', () => {
  const setup = (method: 'signAndSendTransaction' | 'signMessage', vetoed: boolean) => {
    const request = {
      account: { address: WALLET, publicKey: WALLET },
      method,
      reject: vi.fn(),
      resolve: vi.fn(),
    };
    const assertSendEnabled = vi.fn(async () => {
      if (vetoed) throw new Error('solana_transfer_disabled');
    });
    const exportMnemonic = vi.fn();
    const state = {
      keyringService: { exportMnemonic, getAllAccounts: () => [], getPassword: () => 'password', isResetting: false },
      requestService: { getSignRequest: () => request },
      sendKillSwitchService: { assertSendEnabled },
    } as unknown as State;
    const extension = new Extension(state);

    // Site-grant and wallet-reset revalidation have their own tests; this one is about the send kill switch.
    Object.assign(extension, { assertNonEvmSigningAuthorization: vi.fn(), assertSigningSiteAllowed: vi.fn(async () => undefined) });

    return { assertSendEnabled, exportMnemonic, extension, request };
  };

  it('refuses to sign or broadcast when Solana sends are vetoed, before any key is read', async () => {
    const { assertSendEnabled, exportMnemonic, extension, request } = setup('signAndSendTransaction', true);

    await expect(extension.signSolanaApprove({ id: 'request-1' })).resolves.toBe(false);

    expect(assertSendEnabled).toHaveBeenCalledWith('solanaSend');
    expect(request.reject).toHaveBeenCalledWith(expect.objectContaining({ message: 'solana_transfer_disabled' }));
    expect(request.resolve).not.toHaveBeenCalled();
    expect(resolveSolanaSignAndSendTransaction).not.toHaveBeenCalled();
    expect(exportMnemonic).not.toHaveBeenCalled();
  });

  it('signs and broadcasts when sends are enabled', async () => {
    const { extension, request } = setup('signAndSendTransaction', false);

    resolveSolanaSignAndSendTransaction.mockResolvedValue({ signature: 'signature' });

    await expect(extension.signSolanaApprove({ id: 'request-1' })).resolves.toBe(true);

    expect(resolveSolanaSignAndSendTransaction).toHaveBeenCalledOnce();
    expect(request.resolve).toHaveBeenCalledWith({ signature: 'signature' });
  });

  it('still signs a message while sends are vetoed, because that moves no funds', async () => {
    const { assertSendEnabled, extension, request } = setup('signMessage', true);

    resolveSolanaSigning.mockReturnValue({ signatureBase58: 'signature' });

    await expect(extension.signSolanaApprove({ id: 'request-1' })).resolves.toBe(true);

    expect(assertSendEnabled).not.toHaveBeenCalled();
    expect(request.resolve).toHaveBeenCalledWith({ signatureBase58: 'signature' });
  });
});
