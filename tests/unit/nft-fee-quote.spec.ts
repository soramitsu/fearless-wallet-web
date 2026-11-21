import { effectScope, ref, type EffectScope } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CheckNftResponse, NftTx } from '@extension-base/services/nft-service/types';
import { useNftFeeQuote } from '@/portfolio/nftFeeQuote';
let scope: EffectScope;
function deferred() { let resolve!: (value: CheckNftResponse) => void, reject!: (reason: Error) => void; const promise = new Promise<CheckNftResponse>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function fixture() {
  scope = effectScope();
  const tx = ref({ from: 'owner', to: 'first', network: 'Ethereum' } as NftTx);
  const pending = deferred();
  const check = vi.fn().mockReturnValue(pending.promise);
  const quote = scope.run(() => useNftFeeQuote(tx, check))!;
  return { tx, pending, check, quote };
}
afterEach(() => scope.stop());
describe('NFT fee quote lifecycle', () => {
  it('invalidates a quote synchronously when the recipient changes', async () => {
    const { tx, pending, check, quote } = fixture();
    pending.resolve({ fee: '0.1', data: '0x' }); await pending.promise;
    expect(quote).toMatchObject({ fee: '0.1', pending: false });
    check.mockReturnValue(deferred().promise);
    tx.value.to = 'second';
    expect(quote).toMatchObject({ fee: '', pending: true, error: undefined });
  });
  it('ignores stale successful responses', async () => {
    const { tx, pending, check, quote } = fixture();
    const latest = deferred(); check.mockReturnValue(latest.promise);
    tx.value.to = 'second';
    latest.resolve({ fee: '0.2', data: '0x' }); await latest.promise;
    pending.resolve({ fee: '0.1', data: '0x' }); await pending.promise;
    expect(quote).toMatchObject({ fee: '0.2', pending: false });
  });
  it('ignores an old failure while the latest request remains pending', async () => {
    const { tx, pending, check, quote } = fixture();
    check.mockReturnValue(deferred().promise); tx.value.to = 'second';
    pending.reject(new Error('old failure')); await pending.promise.catch(() => {});
    expect(quote).toMatchObject({ fee: '', pending: true, error: undefined });
  });
  it('clears an insufficient-funds error after a later successful quote', async () => {
    const { tx, pending, check, quote } = fixture();
    pending.resolve({ fee: '1', data: '0x', error: 'insufficientFunds' }); await pending.promise;
    const latest = deferred(); check.mockReturnValue(latest.promise); tx.value.to = 'second';
    latest.resolve({ fee: '0.1', data: '0x' }); await latest.promise;
    expect(quote.error).toBeUndefined();
  });
  it.each(['', 'NaN', 'Infinity', '-0.1'])('blocks malformed fee %s', async (fee) => {
    const { pending, quote } = fixture();
    pending.resolve({ fee, data: '0x' }); await pending.promise;
    expect(quote.error).toBe('estimationFailed');
  });
  it('handles provider rejection without publishing a zero-fee success', async () => {
    const { pending, quote } = fixture();
    pending.reject(new Error('offline')); await pending.promise.catch(() => {});
    expect(quote).toMatchObject({ fee: '', error: 'estimationFailed', pending: false });
  });
  it('ignores a late response after its component scope is destroyed', async () => {
    const { pending, quote } = fixture();
    scope.stop(); pending.resolve({ fee: '0.1', data: '0x' }); await pending.promise;
    expect(quote.fee).toBe('');
  });
});
