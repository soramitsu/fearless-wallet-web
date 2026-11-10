import {
  JsonRpcProvider,
  Network,
  Transaction,
  Wallet,
  parseEther,
  parseUnits,
  toBeHex,
  toQuantity,
  type JsonRpcError,
  type JsonRpcPayload,
  type JsonRpcResult,
} from 'ethers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEVMTransfer, quoteEVMTransfer } from '@extension-base/api/evm/transfer';
import type State from '@extension-base/background/handlers/State';

const fixture = vi.hoisted(() => ({ state: {} }));
vi.mock('@extension-base/background/handlers', () => ({ state: fixture.state }));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));

// Unfunded public key; the node is an in-process stub and nothing reaches a network.
const sender = new Wallet('0x' + '11'.repeat(32));
const eoa = '0x' + '22'.repeat(20);
// WETH9: its payable fallback deposits the value it receives, which costs more gas than a zero-value call.
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const DEPOSIT_GAS = 45_038n;
const ZERO_VALUE_CALL_GAS = 23_974n;
const gwei = (value: string) => parseUnits(value, 'gwei');

type Call = { from?: string; to?: string; value?: string; maxFeePerGas?: string; gasPrice?: string };

const block = {
  number: '0x10', hash: '0x' + '33'.repeat(32), parentHash: '0x' + '44'.repeat(32), timestamp: '0x1',
  nonce: '0x0000000000000000', difficulty: '0x0', gasLimit: '0x1c9c380', gasUsed: '0x0', miner: '0x' + '00'.repeat(20),
  extraData: '0x', baseFeePerGas: toBeHex(gwei('1')), transactions: [],
};

/**
 * Estimates as geth does: a value above the sender's balance fails, and fee fields cap the gas at what the balance
 * pays after the value. Without `from` the zero address sends, whose balance is large.
 */
class GethLikeNode extends JsonRpcProvider {
  estimates: Call[] = [];
  sent: string[] = [];

  constructor(private readonly balance: bigint) {
    super('http://127.0.0.1:1', Network.from(1n), { batchStallTime: 10, batchMaxCount: 30 });
  }

  async _send(payload: JsonRpcPayload | JsonRpcPayload[]): Promise<JsonRpcResult[]> {
    const answers = (Array.isArray(payload) ? payload : [payload]).map(({ id, method, params }): JsonRpcResult | JsonRpcError => {
      switch (method) {
        case 'eth_chainId': return { id, result: '0x1' };
        case 'eth_getTransactionCount': return { id, result: '0x7' };
        case 'eth_gasPrice': case 'eth_maxPriorityFeePerGas': return { id, result: toBeHex(gwei('1')) };
        case 'eth_getBlockByNumber': return { id, result: block };
        case 'eth_estimateGas': {
          const call = (params as Call[])[0];
          const value = BigInt(call.value ?? '0x0');
          const balance = call.from === undefined ? parseEther('10000') : this.balance;
          const feeCap = BigInt(call.maxFeePerGas ?? call.gasPrice ?? '0x0');
          const gas = call.to === weth ? (value > 0n ? DEPOSIT_GAS : ZERO_VALUE_CALL_GAS) : 21_000n;

          this.estimates.push(call);
          if (value > balance) return { id, error: { code: -32000, message: 'insufficient funds for transfer' } };
          if (feeCap > 0n && (balance - value) / feeCap < gas) {
            return { id, error: { code: -32000, message: `gas required exceeds allowance (${(balance - value) / feeCap})` } };
          }

          return { id, result: toBeHex(gas) };
        }
        case 'eth_sendRawTransaction': {
          const [raw] = params as string[];

          this.sent.push(raw);

          return { id, result: Transaction.from(raw).hash! };
        }
        default: return { id, error: { code: -32601, message: `the method ${method} does not exist` } };
      }
    });

    // ethers reads error answers from the same list.
    return answers as JsonRpcResult[];
  }
}

function background(node: GethLikeNode) {
  Object.assign(fixture.state, {
    keyringService: { isResetting: false, walletResetRevision: 0 },
    balanceService: { evmBalanceService: { fetchBalance: vi.fn() } },
    networkService: { evmApiHandler: { rebuildApi: vi.fn() } },
    getEvmApi: () => ({ api: node }),
  });

  return fixture.state as unknown as State;
}

async function settle<T>(promise: Promise<T>): Promise<T> {
  let settled = false;

  promise.then(() => (settled = true), () => (settled = true));
  for (let step = 0; !settled && step < 400; step++) await vi.advanceTimersByTimeAsync(25);

  return promise;
}

const transfer = (to: string, amount: string) => ({
  from: sender.address,
  to,
  networkKey: 'Ethereum',
  amount,
  balance: { isUtility: true, id: 'ETH', precision: 18 } as never,
});

async function send(state: State, to: string, amount: string) {
  const callback = vi.fn();

  await settle(makeEVMTransfer({ ...transfer(to, amount), privateKey: sender.privateKey, callback, approvedMaxFee: '1' }, state));

  return callback.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the gas limit of a native-coin EVM send', () => {
  it('is estimated for the sender and the value sent to a contract, and signed as estimated', async () => {
    const node = new GethLikeNode(parseEther('2'));

    expect(await send(background(node), weth, '1.5')).toEqual({ status: true });

    expect(node.estimates).toEqual([{ from: sender.address.toLowerCase(), to: weth, value: toQuantity(parseEther('1.5')) }]);
    expect(node.sent).toHaveLength(1);
    expect(Transaction.from(node.sent[0]).value).toBe(parseEther('1.5'));
    expect(Transaction.from(node.sent[0]).gasLimit).toBe(DEPOSIT_GAS);
  });

  it('stays 21000 for an account recipient', async () => {
    const node = new GethLikeNode(parseEther('2'));

    expect(await send(background(node), eoa, '0.5')).toEqual({ status: true });

    expect(Transaction.from(node.sent[0]).gasLimit).toBe(21_000n);
  });

  it('quotes Max, the whole balance: the estimate leaves the fee fields out', async () => {
    const node = new GethLikeNode(parseEther('2'));
    const quote = settle(quoteEVMTransfer(transfer(eoa, '2'), background(node)));

    // (max fee 3 gwei + base fee 1 gwei) × 21000 gas
    await expect(quote).resolves.toMatchObject({ fee: gwei('84000') });
    expect(node.estimates).toEqual([{ from: sender.address.toLowerCase(), to: eoa, value: toQuantity(parseEther('2')) }]);
  });

  it('prices a zero-value transfer for a quote above the balance, like the 1 coin quoted before an amount is entered', async () => {
    const node = new GethLikeNode(parseEther('0.5'));
    const quote = settle(quoteEVMTransfer(transfer(eoa, '1'), background(node)));

    await expect(quote).resolves.toMatchObject({ fee: gwei('84000') });
    expect(node.estimates).toEqual([
      { from: sender.address.toLowerCase(), to: eoa, value: toQuantity(parseEther('1')) },
      { from: sender.address.toLowerCase(), to: eoa },
    ]);
  });

  it('is never estimated for another value when the send is', async () => {
    const node = new GethLikeNode(parseEther('0.5'));
    const callback = vi.fn();
    const sending = makeEVMTransfer(
      { ...transfer(weth, '1'), privateKey: sender.privateKey, callback, approvedMaxFee: '1' },
      background(node)
    );

    // The background reports the rejection to the Send screen as a failure.
    await expect(settle(sending)).rejects.toThrow('insufficient funds');
    expect(node.estimates).toHaveLength(1);
    expect(node.sent).toHaveLength(0);
    expect(callback).not.toHaveBeenCalled();
  });
});
