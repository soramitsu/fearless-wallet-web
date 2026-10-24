// @vitest-environment node
import { createRequire } from 'node:module';
import { Address, TonClient4 } from '@ton/ton';
import { HttpApi } from '@ton/ton/dist/client/api/HttpApi';
import { z } from 'zod';
import type { AxiosAdapter } from 'axios';

const address = new Address(0, Buffer.alloc(32));
const block = { workchain: 0, seqno: 1, shard: '0', rootHash: 'root', fileHash: 'file' };
const adapterFor =
  (data: unknown): AxiosAdapter =>
  async (config) => ({
    config,
    data,
    headers: {},
    status: 200,
    statusText: 'OK',
  });
const moduleRequire = createRequire(import.meta.url);
const legacyRequire = createRequire(moduleRequire.resolve('@subwallet/keyring'));
const legacyTon = legacyRequire('@ton/ton') as typeof import('@ton/ton');
const legacyHttp = legacyRequire(
  '@ton/ton/dist/client/api/HttpApi'
) as typeof import('@ton/ton/dist/client/api/HttpApi');

const parsedTransaction = (options: Record<string, unknown>) => ({
  address: address.toString(),
  lt: '1',
  hash: 'hash',
  prevTransaction: { lt: '0', hash: 'previous' },
  time: 1,
  outMessagesCount: 0,
  oldStatus: 'active',
  newStatus: 'active',
  fees: '1',
  update: { oldHash: 'old', newHash: 'new' },
  inMessage: null,
  outMessages: [],
  parsed: {
    seqno: 1,
    body: null,
    status: 'success',
    dest: null,
    kind: 'out',
    amount: '1',
    resolvedAddress: address.toString(),
    bounced: false,
    mentioned: [],
  },
  operation: { address: address.toString(), items: [], op: { type: 'withdraw', options } },
});

describe.each([
  ['current', TonClient4, HttpApi],
  ['legacy keyring', legacyTon.TonClient4, legacyHttp.HttpApi],
] as const)('%s TON SDK with the security-fixed Zod parser', (_name, Client, Http) => {
  const clientFor = (data: unknown) => new Client({ endpoint: 'https://ton.invalid', httpAdapter: adapterFor(data) });
  it('parses a block response when extension CSP blocks dynamic Function', async () => {
    const data = { last: block, init: { fileHash: 'file', rootHash: 'root' }, stateRootHash: 'state', now: 1 };
    const blockedFunction = vi.fn(function () {
      throw new EvalError('Dynamic code is blocked by extension CSP');
    });
    vi.stubGlobal('Function', blockedFunction);
    try {
      expect(await clientFor(data).getLastBlock()).toEqual(data);
      expect(blockedFunction).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('preserves account currency records and rejects malformed balances', async () => {
    const account = {
      state: { type: 'uninit' },
      balance: { coins: '10', currencies: { '1': '20' } },
      last: null,
      storageStat: null,
    };
    expect(await clientFor({ block, account }).getAccount(1, address)).toEqual({ block, account });
    await expect(
      clientFor({ block, account: { ...account, balance: { coins: [] } } }).getAccount(1, address)
    ).rejects.toThrow('Mailformed response');
  });

  it('preserves string-valued parsed operation options after the record signature migration', async () => {
    const data = { blocks: [block], transactions: [parsedTransaction({ asset: 'TON', amount: '1' })] };
    expect(await clientFor(data).getAccountTransactionsParsed(address, 1n, Buffer.alloc(32))).toEqual(data);
  });

  it('rejects non-string parsed operation options', async () => {
    const data = { blocks: [block], transactions: [parsedTransaction({ amount: 1 })] };
    await expect(clientFor(data).getAccountTransactionsParsed(address, 1n, Buffer.alloc(32))).rejects.toThrow(
      'Mailformed response'
    );
  });

  it('keeps HttpApi response validation and formatted errors working', async () => {
    const data = {
      balance: '10',
      state: 'uninitialized',
      data: '',
      code: '',
      last_transaction_id: { '@type': 'internal.transactionId', lt: '0', hash: '' },
      block_id: { '@type': 'ton.blockIdExt', workchain: 0, shard: '0', seqno: 1, root_hash: 'root', file_hash: 'file' },
      sync_utime: 1,
    };
    const api = new Http('https://ton.invalid', { adapter: adapterFor({ ok: true, result: data }) });
    expect(await api.getAddressInformation(address)).toEqual(data);
    const invalid = new Http('https://ton.invalid', { adapter: adapterFor({ ok: true, result: null }) });
    await expect(invalid.getAddressInformation(address)).rejects.toThrow('Malformed response');
  });

  it('rejects oversized bounded collections before parsing elements', () => {
    const element = z.string().transform(() => {
      throw new Error('An oversized collection must not visit elements');
    });
    const result = z
      .array(element)
      .max(2)
      .safeParse(Array.from({ length: 1024 }, () => 'value'));
    expect(result.success).toBe(false);
    expect(result.error?.issues).toHaveLength(1);
    expect(result.error?.issues[0].code).toBe('too_big');
  });
});
