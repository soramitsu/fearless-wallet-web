import { describe, expect, it, vi } from 'vitest';
import EvmRequestHandler from '@extension-base/services/request-service/handlers/EvmRequestHandler';
import type { RequestService } from '@extension-base/services/request-service';

const context = {
  authorizationRevision: 0,
  account: { address: '0x1111111111111111111111111111111111111111', name: 'Public fixture', isMobile: false },
  network: { name: 'Ethereum', chainId: '1', genesisHash: '0x1234', symbol: 'ETH', decimals: 18 },
};
const create = () => new EvmRequestHandler({ updateIcon: vi.fn(), popupOpen: vi.fn() } as unknown as RequestService);
const params = () => [
  { from: context.account.address, to: '0x2222222222222222222222222222222222222222', value: '0x1' },
];

describe('EVM request snapshot ownership', () => {
  it('rejects a context captured before authorization changed instead of requeuing it after reset', async () => {
    const handler = new EvmRequestHandler({ updateIcon: vi.fn(), popupOpen: vi.fn(),
      authRequestHandler: { getEvmAuthorizationSnapshot: () => ({ revision: context.authorizationRevision + 1 }) },
    } as unknown as RequestService);
    await expect(handler.confirmSign('stale', 'https://public.example', 'eth_sendTransaction', params(), context)).rejects.toThrow();
    expect(handler.signEvmSubject.value).toEqual({});
  });
  it('rejects a pending claimed request on reset and ignores its late signer result', async () => {
    const handler = create();
    const signing = handler.confirmSign('reset-pending', 'https://public.example', 'eth_sendTransaction', params(), context);
    const result = signing.then(() => 'resolved', () => 'rejected');
    const queued = handler.claimEvmSignRequest('reset-pending');
    handler.resetWallet();
    queued.resolve({ id: 'reset-pending', payload: '0x1234' });
    expect(await result).toBe('rejected');
    expect(handler.signEvmSubject.value).toEqual({});
  });
  it('publishes the exact method, account and network and registers before notifying observers', async () => {
    const handler = create();
    let registered = false;
    const sub = handler.signEvmSubject.subscribe((requests) => {
      if (requests.first) registered = !!handler.getEvmSignRequest('first');
    });
    const signing = handler.confirmSign('first', 'https://public.example', 'eth_sendTransaction', params(), context);
    expect(handler.signEvmSubject.value.first).toEqual({
      id: 'first',
      url: 'https://public.example',
      method: 'eth_sendTransaction',
      data: params(),
      ...context,
    });
    expect(registered).toBe(true);
    handler.getEvmSignRequest('first').resolve({ id: 'first', payload: '0x1234' });
    await signing;
    sub.unsubscribe();
  });

  it('isolates the signed payload from caller and subscriber mutations', async () => {
    const handler = create();
    const data = params();
    const signing = handler.confirmSign('first', 'https://public.example', 'eth_sendTransaction', data, context);
    data[0].value = '0x9999';
    (handler.signEvmSubject.value.first.data as ReturnType<typeof params>)[0].to = context.account.address;
    expect(handler.getEvmSignRequest('first').data).toEqual(params());
    handler.getEvmSignRequest('first').resolve({ id: 'first', payload: '0x1234' });
    await signing;
  });

  it('never publishes resolver functions after another request completes', async () => {
    const handler = create();
    const first = handler.confirmSign('first', 'https://public.example', 'eth_sendTransaction', params(), context);
    const second = handler.confirmSign('second', 'https://other.example', 'eth_sendTransaction', params(), context);
    handler.getEvmSignRequest('first').resolve({ id: 'first', payload: '0x1234' });
    await first;
    expect(Object.keys(handler.signEvmSubject.value.second).sort()).toEqual([
      'account',
      'authorizationRevision',
      'data',
      'id',
      'method',
      'network',
      'url',
    ]);
    handler.getEvmSignRequest('second').resolve({ id: 'second', payload: '0x1234' });
    await second;
  });

  it('rejects a duplicate live ID and ignores late completion after ID reuse', async () => {
    const handler = create();
    const first = handler.confirmSign('first', 'https://public.example', 'eth_sendTransaction', params(), context);
    const original = handler.getEvmSignRequest('first');
    await expect(
      handler.confirmSign(
        'first',
        'https://other.example',
        'personal_sign',
        ['0x1234', context.account.address],
        context
      )
    ).rejects.toThrow();
    expect(handler.getEvmSignRequest('first')).toBe(original);
    original.resolve({ id: 'first', payload: '0x1234' });
    await first;
    const replacement = handler.confirmSign('first', 'https://other.example', 'eth_sendTransaction', params(), context);
    original.resolve({ id: 'first', payload: '0xabcd' });
    expect(handler.signEvmSubject.value.first.url).toBe('https://other.example');
    handler.getEvmSignRequest('first').resolve({ id: 'first', payload: '0x1234' });
    await replacement;
  });
});
