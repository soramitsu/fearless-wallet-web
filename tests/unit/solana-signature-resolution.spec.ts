import { describe, expect, it, vi } from 'vitest';

import {
  SOLANA_GENESIS_HASHES,
  SolanaRpcClient,
  SolanaRpcError,
  type SolanaSignatureResolution,
  type SolanaSignatureStatus,
} from '@extension-base/services/solana-rpc-service';

const MAINNET = SOLANA_GENESIS_HASHES.mainnet;
const DEVNET = SOLANA_GENESIS_HASHES.devnet;
const SIGNATURE = '5'.repeat(88);
const OTHER_SIGNATURE = '6'.repeat(88);
const THIRD_SIGNATURE = '7'.repeat(88);
const LAST_VALID = 456;

type Request = { id: number; method: string; params?: unknown[] };
type Node = {
  /** Finalized progress this node reports. */
  finalized?: { blockHeight: number; slot: number };
  /** Answer to the signature lookup; a number is the HTTP status of a failure. */
  lookup?: { slot: number; value: unknown[] } | number | { raw: unknown };
  genesis?: string;
};

let urlCounter = 0;
const uniqueUrl = (host: string) => `https://${host}-${(urlCounter += 1)}.example`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status });
const answer = (request: Request, result: unknown) => json({ id: request.id, jsonrpc: '2.0', result });

function serve(nodes: Record<string, Node>) {
  const calls: Array<{ method: string; url: string }> = [];
  const fetchFn = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const request = JSON.parse(String(init?.body)) as Request;
    const node = nodes[url];

    calls.push({ method: request.method, url });
    if (!node) throw new Error(`unexpected request to ${url}`);

    if (request.method === 'getGenesisHash') return answer(request, node.genesis ?? MAINNET);

    if (request.method === 'getEpochInfo') {
      if (!node.finalized) return json({ error: 'unavailable' }, 503);

      return answer(request, {
        absoluteSlot: node.finalized.slot,
        blockHeight: node.finalized.blockHeight,
        epoch: 1,
        slotIndex: 1,
        slotsInEpoch: 432_000,
      });
    }

    if (request.method === 'getSignatureStatuses') {
      const { lookup } = node;

      if (!lookup) return json({ error: 'unavailable' }, 503);
      if (typeof lookup === 'number') return json({ error: 'unavailable' }, lookup);
      if ('raw' in lookup) return answer(request, lookup.raw);

      return answer(request, { context: { slot: lookup.slot }, value: lookup.value });
    }

    return json({ error: { code: -32601, message: 'unexpected method' }, id: request.id, jsonrpc: '2.0' });
  });

  return { calls, fetchFn };
}

const clientFor = (nodes: Record<string, Node>, options: { expectedGenesisHash?: string } = {}) => {
  const { calls, fetchFn } = serve(nodes);

  return {
    calls,
    client: new SolanaRpcClient({
      ...options,
      failover: { rounds: 1, sleep: async () => undefined },
      fetchFn,
      rpcUrls: Object.keys(nodes),
    }),
  };
};

const confirmed = { confirmationStatus: 'confirmed', confirmations: 1, err: null, slot: 900 };
const noTrace = (slot: number) => ({ slot, value: [null] });
const state = (resolutions: SolanaSignatureResolution[]) => resolutions.map(({ state: value }) => value);

describe('Solana signature resolution', () => {
  it('proves expiry from one node that finalized past the last valid block and still has no trace', async () => {
    const node = uniqueUrl('node');
    const { calls, client } = clientFor({
      [node]: { finalized: { blockHeight: LAST_VALID + 1, slot: 1_000 }, lookup: noTrace(1_001) },
    });

    await expect(client.resolveSignatures([{ lastValidBlockHeight: LAST_VALID, signature: SIGNATURE }])).resolves.toEqual([
      { state: 'expired' },
    ]);
    // Finality is read first, so the lookup is at least as recent as the progress it is judged against.
    expect(calls.map(({ method }) => method)).toEqual(['getEpochInfo', 'getSignatureStatuses']);
  });

  it('does not call a transaction expired until the node has finalized past its last valid block', async () => {
    const node = uniqueUrl('node');
    const { client } = clientFor({
      [node]: { finalized: { blockHeight: LAST_VALID, slot: 1_000 }, lookup: noTrace(1_001) },
    });

    await expect(client.resolveSignatures([{ lastValidBlockHeight: LAST_VALID, signature: SIGNATURE }])).resolves.toEqual([
      { state: 'pending' },
    ]);
  });

  it('does not trust a lookup that is older than the progress it is judged against', async () => {
    const node = uniqueUrl('lagging-replica');
    const { client } = clientFor({
      [node]: { finalized: { blockHeight: LAST_VALID + 50, slot: 1_000 }, lookup: noTrace(999) },
    });

    await expect(client.resolveSignatures([{ lastValidBlockHeight: LAST_VALID, signature: SIGNATURE }])).resolves.toEqual([
      { state: 'pending' },
    ]);
  });

  it.each<[string, SolanaSignatureStatus]>([
    ['confirmed', { confirmationStatus: 'confirmed', confirmations: 3, err: null, slot: 900 }],
    ['finalized', { confirmationStatus: 'finalized', confirmations: null, err: null, slot: 900 }],
    ['rooted, as nodes report an old transaction', { confirmationStatus: null, confirmations: null, err: null, slot: 900 }],
    ['failed on chain', { confirmationStatus: 'confirmed', confirmations: 1, err: { InstructionError: [0, 'Custom'] }, slot: 900 }],
  ])('reports a %s transaction as landed, with the status', async (_label, status) => {
    const node = uniqueUrl('node');
    const { client } = clientFor({
      [node]: { finalized: { blockHeight: 10, slot: 1_000 }, lookup: { slot: 1_001, value: [status] } },
    });
    const [resolution] = await client.resolveSignatures([{ lastValidBlockHeight: LAST_VALID, signature: SIGNATURE }]);

    expect(resolution).toEqual({ state: 'landed', status });
  });

  it('keeps a trace that is only processed in flight, even past the last valid block', async () => {
    const node = uniqueUrl('node');
    const { client } = clientFor({
      [node]: {
        finalized: { blockHeight: LAST_VALID + 50, slot: 1_000 },
        lookup: {
          slot: 1_001,
          value: [{ confirmationStatus: 'processed', confirmations: 0, err: null, slot: 990 }],
        },
      },
    });

    await expect(client.resolveSignatures([{ lastValidBlockHeight: LAST_VALID, signature: SIGNATURE }])).resolves.toEqual([
      { state: 'pending' },
    ]);
  });

  it('judges every query on its own', async () => {
    const node = uniqueUrl('node');
    const { client } = clientFor({
      [node]: {
        finalized: { blockHeight: 200, slot: 1_000 },
        lookup: { slot: 1_001, value: [confirmed, null, null] },
      },
    });
    const resolutions = await client.resolveSignatures([
      { lastValidBlockHeight: 300, signature: SIGNATURE },
      { lastValidBlockHeight: 100, signature: OTHER_SIGNATURE },
      { lastValidBlockHeight: 300, signature: THIRD_SIGNATURE },
    ]);

    expect(state(resolutions)).toEqual(['landed', 'expired', 'pending']);
  });

  describe('with several nodes', () => {
    const query = [{ lastValidBlockHeight: LAST_VALID, signature: SIGNATURE }];
    const proof = (): Node => ({ finalized: { blockHeight: LAST_VALID + 10, slot: 1_000 }, lookup: noTrace(1_001) });
    const behind = (): Node => ({ finalized: { blockHeight: LAST_VALID - 50, slot: 800 }, lookup: noTrace(801) });

    it('never combines what two nodes say: one is ahead, the other has the lookup', async () => {
      // The first node has finalized far enough but cannot look the signature up; the second can look it up but has
      // not finalized that far. Neither can prove expiry, and their answers must not be put together to do so.
      const ahead = uniqueUrl('ahead');
      const lookingUp = uniqueUrl('looking-up');
      const { client } = clientFor({
        [ahead]: { finalized: { blockHeight: LAST_VALID + 10, slot: 1_000 }, lookup: 503 },
        [lookingUp]: behind(),
      });

      await expect(client.resolveSignatures(query)).resolves.toEqual([{ state: 'pending' }]);
    });

    it.each<[string, boolean]>([
      ['first', true],
      ['last', false],
    ])('keeps it pending when a node that has not caught up disagrees, whether it answers %s', async (_order, behindFirst) => {
      const ahead = uniqueUrl('ahead');
      const lagging = uniqueUrl('lagging');
      const { client } = clientFor(behindFirst ? { [lagging]: behind(), [ahead]: proof() } : { [ahead]: proof(), [lagging]: behind() });

      await expect(client.resolveSignatures(query)).resolves.toEqual([{ state: 'pending' }]);
    });

    it('keeps it pending when another node has seen the signature, whatever it has confirmed', async () => {
      const ahead = uniqueUrl('ahead');
      const seeing = uniqueUrl('seeing');
      const { client } = clientFor({
        [ahead]: proof(),
        [seeing]: {
          finalized: { blockHeight: LAST_VALID + 10, slot: 1_000 },
          lookup: { slot: 1_001, value: [{ confirmationStatus: 'processed', confirmations: 0, err: null, slot: 995 }] },
        },
      });

      await expect(client.resolveSignatures(query)).resolves.toEqual([{ state: 'pending' }]);
    });

    it('reports it landed when any node confirms it, even after another proved expiry', async () => {
      const ahead = uniqueUrl('ahead');
      const confirming = uniqueUrl('confirming');
      const { client } = clientFor({
        [ahead]: proof(),
        [confirming]: { finalized: { blockHeight: 5, slot: 10 }, lookup: { slot: 11, value: [confirmed] } },
      });

      await expect(client.resolveSignatures(query)).resolves.toEqual([{ state: 'landed', status: confirmed }]);
    });

    it('does not ask the remaining nodes once every transaction has landed', async () => {
      const first = uniqueUrl('first');
      const second = uniqueUrl('second');
      const { calls, client } = clientFor({
        [first]: { finalized: { blockHeight: 5, slot: 10 }, lookup: { slot: 11, value: [confirmed] } },
        [second]: proof(),
      });

      await client.resolveSignatures(query);

      expect(calls.some(({ url }) => url === second)).toBe(false);
    });

    it('stands on one node when the others cannot answer', async () => {
      const ahead = uniqueUrl('ahead');
      const down = uniqueUrl('down');
      const throttled = uniqueUrl('throttled');
      const { client } = clientFor({ [down]: {}, [throttled]: { finalized: { blockHeight: 1, slot: 1 }, lookup: 429 }, [ahead]: proof() });

      await expect(client.resolveSignatures(query)).resolves.toEqual([{ state: 'expired' }]);
    });

    it('fails when no node answers, so the caller keeps the record', async () => {
      const first = uniqueUrl('down');
      const second = uniqueUrl('down');
      const { client } = clientFor({ [first]: {}, [second]: { finalized: { blockHeight: 1, slot: 1 }, lookup: 500 } });
      const error = await client.resolveSignatures(query).catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(SolanaRpcError);
    });

    it('takes no evidence from a node that serves another cluster', async () => {
      const wrong = uniqueUrl('devnet-node');
      const right = uniqueUrl('mainnet-node');
      const { calls, client } = clientFor(
        { [wrong]: { ...proof(), genesis: DEVNET }, [right]: { ...behind(), genesis: MAINNET } },
        { expectedGenesisHash: MAINNET }
      );

      await expect(client.resolveSignatures(query)).resolves.toEqual([{ state: 'pending' }]);
      expect(calls.filter(({ url }) => url === wrong).map(({ method }) => method)).toEqual(['getGenesisHash']);
    });
  });

  describe('input and answers', () => {
    it('refuses queries it cannot send', async () => {
      const node = uniqueUrl('node');
      const { calls, client } = clientFor({ [node]: {} });

      await expect(client.resolveSignatures([])).rejects.toThrow('invalid_signatures');
      await expect(client.resolveSignatures([{ lastValidBlockHeight: LAST_VALID, signature: 'not a signature' }])).rejects.toThrow(
        'invalid_signature_response'
      );
      await expect(client.resolveSignatures([{ lastValidBlockHeight: -1, signature: SIGNATURE }])).rejects.toThrow(
        'invalid_block_height'
      );
      expect(calls).toEqual([]);
    });

    it.each<[string, NonNullable<Node['lookup']>]>([
      ['without a context slot', { raw: { value: [null] } }],
      ['for a different number of signatures', { slot: 1_001, value: [null, null] }],
    ])('treats a lookup answered %s as no answer', async (_label, lookup) => {
      const node = uniqueUrl('node');
      const { client } = clientFor({
        [node]: { finalized: { blockHeight: LAST_VALID + 10, slot: 1_000 }, lookup },
      });

      await expect(client.resolveSignatures([{ lastValidBlockHeight: LAST_VALID, signature: SIGNATURE }])).rejects.toThrow(
        'invalid_signature_status_response'
      );
    });
  });
});
