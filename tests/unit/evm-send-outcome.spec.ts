import {
  JsonRpcProvider,
  Network,
  Transaction,
  Wallet,
  makeError,
  type JsonRpcError,
  type JsonRpcPayload,
  type JsonRpcResult,
} from 'ethers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEVMTransfer } from '@extension-base/api/evm/transfer';
import type State from '@extension-base/background/handlers/State';
import {
  getTransactionFailurePresentation,
  getTransactionOutcome,
  getUnknownTransactionHash,
} from '@/helpers/transactionFailure';

const fixture = vi.hoisted(() => ({ state: {} }));
vi.mock('@extension-base/background/handlers', () => ({ state: fixture.state }));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));

// Unfunded public key; the nodes are in-process stubs and nothing reaches a network.
const sender = new Wallet('0x' + '11'.repeat(32));
const recipient = '0x' + '22'.repeat(20);

// What a node does with eth_sendRawTransaction. `pooled` says whether the network has the transaction afterwards.
type SendBehaviour =
  | { kind: 'answer'; pooled: boolean }
  | { kind: 'destroyed'; pooled: boolean }
  | { kind: 'http'; pooled: boolean }
  | { kind: 'error'; pooled: boolean; error: { code: number; message: string } }
  | { kind: 'malformed'; pooled: boolean }
  | { kind: 'silent'; pooled: boolean };

const block = {
  number: '0x10', hash: '0x' + '33'.repeat(32), parentHash: '0x' + '44'.repeat(32), timestamp: '0x1',
  nonce: '0x0000000000000000', difficulty: '0x0', gasLimit: '0x1c9c380', gasUsed: '0x0', miner: '0x' + '00'.repeat(20),
  extraData: '0x', baseFeePerGas: '0x3b9aca00', transactions: [],
};

// A node of a network whose mempool `pool` it shares with the network's other nodes. Its block number is rate-limited.
class FakeNode extends JsonRpcProvider {
  sent = 0;
  lookups = 0;

  constructor(private readonly pool: Set<string>, private readonly behaviour: SendBehaviour = { kind: 'answer', pooled: true }) {
    super('http://127.0.0.1:1', Network.from(1n), { batchStallTime: 10, batchMaxCount: 30 });
  }

  async _send(payload: JsonRpcPayload | JsonRpcPayload[]): Promise<JsonRpcResult[]> {
    const list = Array.isArray(payload) ? payload : [payload];
    const raw = list.find(({ method }) => method === 'eth_sendRawTransaction');

    if (raw) {
      const hash = Transaction.from((raw.params as string[])[0]).hash!;

      this.sent += 1;
      if (this.behaviour.pooled) this.pool.add(hash);
      if (this.behaviour.kind === 'silent') return new Promise(() => undefined);
      if (this.behaviour.kind === 'http') throw makeError('server response 503 Service Unavailable', 'SERVER_ERROR');
      // A balance read's failover replaces and destroys this provider while the node's answer is on its way back.
      if (this.behaviour.kind === 'destroyed') this.destroy();
    }

    const answers = list.map(({ id, method, params }): JsonRpcResult | JsonRpcError => {
      switch (method) {
        case 'eth_chainId': return { id, result: '0x1' };
        case 'eth_getTransactionCount': return { id, result: '0x7' };
        case 'eth_estimateGas': return { id, result: '0x5208' };
        case 'eth_gasPrice': case 'eth_maxPriorityFeePerGas': return { id, result: '0x3b9aca00' };
        case 'eth_getBlockByNumber': return { id, result: block };
        case 'eth_blockNumber': return { id, error: { code: -32005, message: 'rate limited' } };
        case 'eth_getTransactionByHash': {
          const [hash] = params as string[];

          this.lookups += 1;

          return { id, result: this.pool.has(hash) ? { hash, nonce: '0x7' } : null };
        }
        case 'eth_sendRawTransaction': {
          if (this.behaviour.kind === 'error') return { id, error: this.behaviour.error };
          if (this.behaviour.kind === 'malformed') return { id, result: 'accepted' };

          return { id, result: Transaction.from((params as string[])[0]).hash! };
        }
        default: return { id, error: { code: -32601, message: `the method ${method} does not exist` } };
      }
    });

    // ethers reads error answers from the same list.
    return answers as JsonRpcResult[];
  }
}

/** The background with these nodes. A destroyed provider has been replaced by the next one, as by a failover. */
function background(...nodes: FakeNode[]) {
  Object.assign(fixture.state, {
    keyringService: { isResetting: false, walletResetRevision: 0 },
    balanceService: { evmBalanceService: { fetchBalance: vi.fn() } },
    getEvmApi: () => ({ api: nodes.find((node) => !node.destroyed) ?? nodes[nodes.length - 1] }),
  });
}

/** Sends 0.01 ETH and returns what the Send screen was told, and after how long. */
async function send() {
  const callback = vi.fn();
  const started = Date.now();
  let settled = false;
  const sending = makeEVMTransfer(
    {
      from: sender.address,
      to: recipient,
      networkKey: 'Ethereum',
      amount: '0.01',
      privateKey: sender.privateKey,
      balance: { isUtility: true, id: 'ETH' } as never,
      callback,
      approvedMaxFee: '1',
    },
    fixture.state as unknown as State
  );

  sending.then(() => (settled = true), () => (settled = true));
  while (!settled && Date.now() - started < 120_000) await vi.advanceTimersByTimeAsync(250);
  await sending;
  expect(callback).toHaveBeenCalledOnce();

  return { response: callback.mock.calls[0][0], elapsed: Date.now() - started };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('an EVM send the node may have taken', () => {
  it('is sent when the node takes it, whatever the block number lookup does', async () => {
    const node = new FakeNode(new Set());

    background(node);
    const { response } = await send();

    expect(node.sent).toBe(1);
    expect(response).toEqual({ status: true });
  });

  it('is looked up on the network’s current provider when its own was destroyed with the answer on its way', async () => {
    const pool = new Set<string>();
    const sending = new FakeNode(pool, { kind: 'destroyed', pooled: true });
    const replacement = new FakeNode(pool);

    background(sending, replacement);
    const { response } = await send();

    expect(sending.sent).toBe(1);
    expect(replacement.sent).toBe(0);
    expect(replacement.lookups).toBeGreaterThan(0);
    expect(response).toEqual({ status: true });
  });

  it.each([
    ['an HTTP error', { kind: 'http', pooled: true }],
    ['a rate-limit answer', { kind: 'error', pooled: true, error: { code: -32005, message: 'limit exceeded' } }],
    ['an answer that is not its hash', { kind: 'malformed', pooled: true }],
    ['"already known"', { kind: 'error', pooled: true, error: { code: -32000, message: 'already known' } }],
  ] as const)('is sent when the network has it after %s', async (_name, behaviour) => {
    const node = new FakeNode(new Set(), behaviour);

    background(node);
    const { response } = await send();

    expect(node.lookups).toBeGreaterThan(0);
    expect(response).toEqual({ status: true });
  });

  it.each([
    ['an HTTP error', { kind: 'http', pooled: false }],
    ['a rate-limit answer', { kind: 'error', pooled: false, error: { code: 429, message: 'Too Many Requests' } }],
    ['an internal error', { kind: 'error', pooled: false, error: { code: -32603, message: 'Internal error' } }],
    ['"nonce too low"', { kind: 'error', pooled: false, error: { code: -32000, message: 'nonce too low: next nonce 8, tx nonce 7' } }],
    ['"Known transaction"', { kind: 'error', pooled: false, error: { code: -32000, message: 'Known transaction' } }],
    ['the provider destroyed', { kind: 'destroyed', pooled: false }],
  ] as const)('has an unknown outcome, shown with its hash, when the network does not have it after %s', async (_name, behaviour) => {
    const pool = new Set<string>();
    const node = new FakeNode(pool, behaviour);
    const replacement = new FakeNode(pool);

    background(node, replacement);
    const { response, elapsed } = await send();
    const hash = response.transactionHash;

    expect(hash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(response).toEqual({
      status: false,
      outcome: 'unknown',
      transactionHash: hash,
      errors: [expect.objectContaining({ message: 'evm_broadcast_ambiguous' })],
    });
    // The Send screen says it may already have been sent and shows the hash, 0x included, to check first.
    expect(getTransactionOutcome(response)).toBe('unconfirmed');
    expect(getUnknownTransactionHash(response)).toBe(hash);
    expect(getTransactionFailurePresentation(response)).toEqual({ key: 'assets.transactionStatusUnknownDetails' });
    // A few lookups within about ten seconds.
    expect(node.lookups + replacement.lookups).toBe(4);
    expect(elapsed).toBeLessThanOrEqual(10_000);
  });

  it('stops waiting for a node that never answers and looks the transaction up', async () => {
    const node = new FakeNode(new Set(), { kind: 'silent', pooled: true });

    background(node);
    const { response, elapsed } = await send();

    expect(response).toEqual({ status: true });
    expect(elapsed).toBeLessThanOrEqual(45_000);
  });

  it.each([
    ['insufficient funds for gas * price + value: balance 0, tx cost 210000000000000'],
    ['replacement transaction underpriced'],
    ['transaction underpriced'],
    ['intrinsic gas too low'],
    ['unknown transaction type'],
  ])('fails, without looking anything up, when the node refuses it: %s', async (message) => {
    const node = new FakeNode(new Set(), { kind: 'error', pooled: false, error: { code: -32000, message } });

    background(node);
    const { response } = await send();

    expect(node.lookups).toBe(0);
    expect(response).toEqual({ status: false, errors: [expect.objectContaining({ code: 'transferError' })] });
    expect(getTransactionOutcome(response)).toBe('failed');
  });
});
