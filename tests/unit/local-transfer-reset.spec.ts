import { SigningKey, Transaction, Wallet, type TransactionLike } from 'ethers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BitcoinEsploraClient } from '@extension-base/services/bitcoin-indexer-service';
import { SolanaRpcClient } from '@extension-base/services/solana-rpc-service';
import { captureWalletResetGuard } from '@extension-base/api/walletResetGuard';
import { makeEVMTransfer } from '@extension-base/api/evm/transfer';
import { signAndSendExtrinsic } from '@extension-base/api/substrate/shared/signAndSendExtrinsic';
import type State from '@extension-base/background/handlers/State';

const fixture = vi.hoisted(() => ({ state: {} }));
vi.mock('@extension-base/background/handlers', () => ({ state: fixture.state }));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));

let state: State;
const reset = () => Object.assign(state.keyringService, { isResetting: false, walletResetRevision: 1 });
beforeEach(() => {
  vi.useFakeTimers();
  state = { keyringService: { isResetting: false, walletResetRevision: 0, getPair: vi.fn(() => ({})) },
    balanceService: { evmBalanceService: { fetchBalance: vi.fn() } } } as unknown as State;
  Object.assign(fixture.state, state);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('local transfer reset ownership', () => {
  it.each(['bitcoin', 'solana'])('does not retry %s broadcast against another endpoint after reset', async kind => {
    const assertCurrent = captureWalletResetGuard(state);
    const fetchFn = vi.fn(async () => { reset(); return new Response('Public unavailable endpoint', { status: 503 }); });
    const operation = kind === 'bitcoin'
      ? new BitcoinEsploraClient({ fetchFn }).broadcastTransaction('0102', '11'.repeat(32), assertCurrent)
      : new SolanaRpcClient({ fetchFn }).sendRawTransaction(Buffer.from([
        1, ...new Uint8Array(64).fill(7), ...[1, 0, 1, 2], ...new Uint8Array(32).fill(1),
        ...new Uint8Array(32), ...new Uint8Array(32).fill(9), ...[1, 1, 1, 0, 0],
      ]).toString('base64'), {}, assertCurrent);
    await expect(operation).rejects.toThrow('Wallet changed during transfer');
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('submits an ordinary EVM transfer as a verified signed envelope when no reset occurs', async () => {
    const sender = new Wallet('0x' + '11'.repeat(32));
    const recipient = '0x' + '22'.repeat(20);
    const broadcastTransaction = vi.fn(async (_signed: string) => ({ hash: 'public hash' }));
    const provider = { broadcastTransaction,
      estimateGas: async () => 21000n, getBlock: async () => ({ baseFeePerGas: 0n }),
      getFeeData: async () => ({ maxFeePerGas: 2n, maxPriorityFeePerGas: 1n, gasPrice: 1n }),
    };
    Object.assign(provider, { provider });
    Object.assign(state, { getEvmApi: () => ({ api: provider }) });
    Object.assign(fixture.state, state);
    vi.spyOn(Wallet.prototype, 'populateTransaction').mockImplementation(async tx => ({ ...tx, chainId: 1n, nonce: 7, type: 2 } as TransactionLike<string>));
    const callback = vi.fn();
    await makeEVMTransfer({ from: sender.address, to: recipient, networkKey: 'Ethereum', amount: '1', privateKey: sender.privateKey,
      balance: { isUtility: true, id: 'ETH' } as never, callback }, state);
    const signed = Transaction.from(broadcastTransaction.mock.calls[0][0]);
    expect(signed.from).toBe(sender.address);
    expect(signed.to?.toLowerCase()).toBe(recipient);
    expect(signed.value).toBe(10n ** 18n);
    expect(signed.nonce).toBe(7);
    expect(signed.chainId).toBe(1n);
    expect(signed.gasLimit).toBe(21000n);
    expect(callback).toHaveBeenCalledWith({ status: true });
  });

  it('does not yield between the final EVM guard and the actual cryptographic signature', async () => {
    const sender = new Wallet('0x' + '11'.repeat(32));
    const provider = { broadcastTransaction: vi.fn(async () => ({ hash: 'public hash' })),
      estimateGas: async () => 21000n, getBlock: async () => ({ baseFeePerGas: 0n }),
      getFeeData: async () => ({ maxFeePerGas: 2n, maxPriorityFeePerGas: 1n, gasPrice: 1n }),
    };
    Object.assign(provider, { provider });
    Object.assign(state, { getEvmApi: () => ({ api: provider }) });
    Object.assign(fixture.state, state);
    let populated = false;
    let scheduled = false;
    vi.spyOn(Wallet.prototype, 'populateTransaction').mockImplementation(async tx => {
      populated = true;
      return { ...tx, from: sender.address, nonce: 7, chainId: 1n, type: 2 } as TransactionLike<string>;
    });
    const sign = SigningKey.prototype.sign;
    const revisions: number[] = [];
    vi.spyOn(SigningKey.prototype, 'sign').mockImplementation(function (digest) {
      revisions.push(state.keyringService.walletResetRevision);
      return sign.call(this, digest);
    });
    const finalGuard = () => {
      if (populated && !scheduled) { scheduled = true; queueMicrotask(reset); }
    };
    await makeEVMTransfer({ from: sender.address, to: '0x' + '22'.repeat(20), networkKey: 'Ethereum',
      amount: '1', privateKey: sender.privateKey, balance: { isUtility: true, id: 'ETH' } as never,
      finalGuard }, state).catch(() => undefined);
    expect(scheduled).toBe(true);
    expect(revisions).toEqual([0]);
  });

  it('revalidates the caller guard after the nonce lookup and before signing', async () => {
    let nonceRead = false;
    const finalGuard = vi.fn(() => { if (nonceRead) throw new Error('Public changed reviewed route'); });
    const extrinsic = { signAsync: vi.fn(), send: vi.fn() };
    const api = { registry: {}, rpc: { system: { accountNextIndex: async () => { nonceRead = true; return 0; } } } };
    await expect(signAndSendExtrinsic({ address: 'public address', apiProps: { api } as never, extrinsic: extrinsic as never,
      isMobile: false, errorMessage: 'Public fixture', finalGuard }, state)).rejects.toThrow('Public changed reviewed route');
    expect(extrinsic.signAsync).not.toHaveBeenCalled();
    expect(extrinsic.send).not.toHaveBeenCalled();
  });

  it.each(['fee lookup', 'nonce population', 'signature'])('does not send EVM bytes after reset during %s', async boundary => {
    const broadcastTransaction = vi.fn(async (_signed: string) => ({ hash: 'public hash' }));
    const provider = { broadcastTransaction,
      estimateGas: vi.fn(async () => 21000n), getBlock: vi.fn(async () => ({ baseFeePerGas: 0n })),
      getFeeData: vi.fn(async () => {
        if (boundary === 'fee lookup') reset();
        return { maxFeePerGas: 2n, maxPriorityFeePerGas: 1n, gasPrice: 1n };
      }),
    };
    Object.assign(provider, { provider });
    Object.assign(state, { getEvmApi: () => ({ api: provider }) });
    Object.assign(fixture.state, state);
    const legacySend = vi.spyOn(Wallet.prototype, 'sendTransaction').mockResolvedValue({} as never);
    const populate = vi.spyOn(Wallet.prototype, 'populateTransaction').mockImplementation(async tx => {
      if (boundary === 'nonce population') reset();
      return tx as never;
    });
    const originalSign = SigningKey.prototype.sign;
    const sign = vi.spyOn(SigningKey.prototype, 'sign').mockImplementation(function (digest) {
      if (boundary === 'signature') reset();
      return originalSign.call(this, digest);
    });
    await expect(makeEVMTransfer({ from: '0x' + '11'.repeat(20), to: '0x' + '22'.repeat(20), networkKey: 'Ethereum',
      amount: '1', privateKey: '0x' + '11'.repeat(32), balance: { isUtility: true, id: 'ETH' } as never }, state))
      .rejects.toThrow('Wallet changed during transfer');
    expect(legacySend).not.toHaveBeenCalled();
    expect(broadcastTransaction).not.toHaveBeenCalled();
    if (boundary === 'fee lookup') expect(populate).not.toHaveBeenCalled();
    if (boundary !== 'signature') expect(sign).not.toHaveBeenCalled();
  });

  it.each(['nonce lookup', 'signer callback', 'signature completion'])('does not sign or submit Substrate after reset during %s', async boundary => {
    const sign = vi.fn(() => ({ signature: '0x0102' }));
    const extrinsic = {
      signAsync: vi.fn(async (_address, { signer }) => {
        if (boundary === 'signer callback') reset();
        await signer.signPayload({ version: 4 });
        if (boundary === 'signature completion') reset();
      }),
      send: vi.fn(async () => vi.fn()),
    };
    const api = { registry: { createType: vi.fn(() => ({ sign })) }, rpc: { system: { accountNextIndex: async () => {
      if (boundary === 'nonce lookup') reset();
      return 0;
    } } } };
    await expect(signAndSendExtrinsic({ address: 'public address', apiProps: { api } as never,
      extrinsic: extrinsic as never, isMobile: false, errorMessage: 'Public fixture' }, state))
      .rejects.toThrow('Wallet changed during transfer');
    expect(extrinsic.send).not.toHaveBeenCalled();
    if (boundary !== 'signature completion') expect(sign).not.toHaveBeenCalled();
  });
});
