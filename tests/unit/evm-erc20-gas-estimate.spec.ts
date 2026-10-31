import {
  Interface,
  JsonRpcProvider,
  Network,
  Transaction,
  Wallet,
  parseUnits,
  toBeHex,
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
const recipient = '0x' + '22'.repeat(20);
// WETH9, whose payable fallback takes a call without data for 25,853 gas; a transfer needs 51,723.
const token = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const erc20 = new Interface(['function transfer(address to, uint256 amount) returns (bool)']);

const block = {
  number: '0x10', hash: '0x' + '33'.repeat(32), parentHash: '0x' + '44'.repeat(32), timestamp: '0x1',
  nonce: '0x0000000000000000', difficulty: '0x0', gasLimit: '0x1c9c380', gasUsed: '0x0', miner: '0x' + '00'.repeat(20),
  extraData: '0x', baseFeePerGas: '0x3b9aca00', transactions: [],
};

// The token's node. A transfer the sender's balance cannot cover reverts.
class TokenNode extends JsonRpcProvider {
  estimates: { data?: string }[] = [];
  sent: string[] = [];

  constructor(private readonly transferReverts: boolean) {
    super('http://127.0.0.1:1', Network.from(1n), { batchStallTime: 10, batchMaxCount: 30 });
  }

  async _send(payload: JsonRpcPayload | JsonRpcPayload[]): Promise<JsonRpcResult[]> {
    const answers = (Array.isArray(payload) ? payload : [payload]).map(({ id, method, params }): JsonRpcResult | JsonRpcError => {
      switch (method) {
        case 'eth_chainId': return { id, result: '0x1' };
        case 'eth_getTransactionCount': return { id, result: '0x7' };
        case 'eth_gasPrice': case 'eth_maxPriorityFeePerGas': return { id, result: '0x3b9aca00' };
        case 'eth_getBlockByNumber': return { id, result: block };
        case 'eth_estimateGas': {
          const call = (params as { data?: string }[])[0];

          this.estimates.push(call);
          if (!call.data) return { id, result: toBeHex(25_853) };
          if (this.transferReverts) return { id, error: { code: 3, message: 'execution reverted', data: '0x' } };

          return { id, result: toBeHex(51_723) };
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

function background(node: TokenNode) {
  Object.assign(fixture.state, {
    keyringService: { isResetting: false, walletResetRevision: 0 },
    balanceService: { evmBalanceService: { fetchBalance: vi.fn() } },
    networkService: { evmApiHandler: { rebuildApi: vi.fn() } },
    evmContractService: { getContract: async () => ({ interface: erc20 }) },
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

const transfer = {
  from: sender.address,
  to: recipient,
  networkKey: 'Ethereum',
  amount: '1',
  balance: { isUtility: false, id: token, precision: 18 } as never,
};

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

describe('an ERC-20 transfer the node cannot estimate', () => {
  it('is not quoted with the gas of a call without its data', async () => {
    const node = new TokenNode(true);

    // The background answers the Send screen with its fee estimate error.
    await expect(settle(quoteEVMTransfer(transfer, background(node)))).rejects.toMatchObject({ code: 'CALL_EXCEPTION' });
    expect(node.estimates).toHaveLength(1);
    expect(node.estimates[0].data).toBe(erc20.encodeFunctionData('transfer', [recipient, parseUnits('1', 18)]));
  });

  it('is not sent', async () => {
    const node = new TokenNode(true);
    const callback = vi.fn();
    const sending = makeEVMTransfer(
      { ...transfer, privateKey: sender.privateKey, callback, approvedMaxFee: '1' },
      background(node)
    );

    // The background reports the rejection to the Send screen as a failure.
    await expect(settle(sending)).rejects.toMatchObject({ code: 'CALL_EXCEPTION' });
    expect(node.sent).toHaveLength(0);
    expect(callback).not.toHaveBeenCalled();
  });
});

describe('an ERC-20 transfer', () => {
  it('is sent with the gas the transfer needs', async () => {
    const node = new TokenNode(false);
    const callback = vi.fn();

    await settle(makeEVMTransfer({ ...transfer, privateKey: sender.privateKey, callback, approvedMaxFee: '1' }, background(node)));

    expect(callback).toHaveBeenCalledWith({ status: true });
    expect(node.sent).toHaveLength(1);
    expect(Transaction.from(node.sent[0]).gasLimit).toBe(51_723n);
    expect(Transaction.from(node.sent[0]).data).toBe(erc20.encodeFunctionData('transfer', [recipient, parseUnits('1', 18)]));
  });
});
