import { describe, expect, it, vi } from 'vitest';
import EvmRequestHandler from '@extension-base/services/request-service/handlers/EvmRequestHandler';
import type { RequestService } from '@extension-base/services/request-service';
import type { WalletConnectTransactionRequest } from '@extension-base/services/wallet-connect-service/types';

const address = '0x1111111111111111111111111111111111111111';
const event = (id = 1, topic = 'public-topic') =>
  ({
    id,
    topic,
    params: { chainId: 'eip155:1', request: { method: 'personal_sign', params: ['0x1234', address] } },
    verifyContext: { verified: { origin: 'https://public.example', validation: 'UNKNOWN', verifyUrl: '' } },
  }) as Omit<WalletConnectTransactionRequest, 'approvalId'>;
const create = () => new EvmRequestHandler({ updateIcon: vi.fn(), popupOpen: vi.fn() } as unknown as RequestService);
const result = { id: 'public-topic', payload: '0x1234' as const };

describe('WalletConnect approval owns one immutable request', () => {
  it('keeps different requests from the same topic independently actionable', async () => {
    const handler = create();
    const first = handler.onWCSign(event(1));
    const second = handler.onWCSign(event(2));
    expect(handler.numWcSignRequest).toBe(2);
    const [a, b] = handler.signWcSubject.value;
    expect(a.approvalId).not.toBe(b.approvalId);
    handler.getSignWCRequest(a.approvalId)!.resolve(result);
    await first;
    expect(handler.signWcSubject.value.map(({ id }) => id)).toEqual([2]);
    handler.getSignWCRequest(b.approvalId)!.resolve(result);
    await second;
    expect(handler.numWcSignRequest).toBe(0);
  });

  it('does not let caller or subscriber mutations change the signing intent', async () => {
    const handler = create();
    const input = event();
    const signing = handler.onWCSign(input);
    input.params.request.params[0] = '0xaaaa';
    const published = handler.signWcSubject.value[0];
    expect(published.params.request.params[0]).toBe('0x1234');
    const original = handler.getSignWCRequest(published.approvalId)!;
    published.params.request.params[0] = '0xbbbb';
    expect(original.request.params.request.params[0]).toBe('0x1234');
    expect(handler.allWcSignRequests[0].params.request.params[0]).toBe('0x1234');
    original.resolve(result);
    await signing;
  });

  it('ignores old completion after a request ID is reused and issues a fresh approval identity', async () => {
    const handler = create();
    const first = handler.onWCSign(event());
    const key = handler.signWcSubject.value[0].approvalId;
    expect(typeof key).toBe('string');
    const original = handler.getSignWCRequest(key)!;
    original.resolve(result);
    await first;
    const next = handler.onWCSign(event());
    const nextKey = handler.signWcSubject.value[0].approvalId;
    expect(nextKey).not.toBe(key);
    original.resolve(result);
    original.reject(new Error('late failure'));
    expect(handler.numWcSignRequest).toBe(1);
    expect(handler.getSignWCRequest(key)).toBeUndefined();
    handler.getSignWCRequest(nextKey)!.resolve(result);
    await next;
  });

  it('rejects duplicate live RPC IDs only within their session', async () => {
    const handler = create();
    const first = handler.onWCSign(event(7));
    const other = handler.onWCSign(event(7, 'other-topic'));
    await expect(handler.onWCSign(event(7))).rejects.toThrow('Duplicate');
    expect(handler.numWcSignRequest).toBe(2);
    for (const { approvalId } of handler.signWcSubject.value) handler.getSignWCRequest(approvalId)!.resolve(result);
    await Promise.all([first, other]);
  });

  it('claims once, blocks rejection during approval and allows retry only after release', async () => {
    const handler = create();
    const signing = handler.onWCSign(event());
    const key = handler.signWcSubject.value[0].approvalId;
    const request = handler.claimWCSignRequest(key);
    expect(() => handler.claimWCSignRequest(key)).toThrow('pending');
    expect(() => handler.rejectWCSignRequest(key)).toThrow('pending');
    handler.releaseWCSignRequest(request);
    expect(handler.claimWCSignRequest(key)).toBe(request);
    handler.releaseWCSignRequest(request);
    const rejected = expect(signing).rejects.toThrow('USER_REJECTED');
    expect(handler.rejectWCSignRequest(key)).toBe(true);
    await rejected;
    expect(handler.rejectWCSignRequest(key)).toBe(false);
    expect(() => handler.claimWCSignRequest(key)).toThrow('unavailable');
  });

  it('registers the exact request before publishing and never exposes resolvers', async () => {
    const handler = create();
    let registered = false;
    const sub = handler.signWcSubject.subscribe((requests) => {
      if (requests.length) {
        registered = !!handler.getSignWCRequest(requests[0].approvalId);
        expect(requests[0]).not.toHaveProperty('resolve');
        expect(requests[0]).not.toHaveProperty('reject');
      }
    });
    const signing = handler.onWCSign(event());
    expect(registered).toBe(true);
    handler.getSignWCRequest(handler.signWcSubject.value[0].approvalId)!.resolve(result);
    await signing;
    sub.unsubscribe();
  });

  it.each([{ topic: '' }, { id: -1 }, { id: 1.5 }, { id: Number.MAX_SAFE_INTEGER + 1 }])(
    'refuses invalid RPC identity %j',
    async (change) => {
      const handler = create();
      await expect(handler.onWCSign({ ...event(), ...change })).rejects.toThrow('identity');
      expect(handler.numWcSignRequest).toBe(0);
    }
  );
});
