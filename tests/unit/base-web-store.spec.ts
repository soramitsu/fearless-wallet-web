import BaseWebStore from '@extension-base/stores/BaseWeb';
import { describe, expect, it, vi } from 'vitest';

class TestWebStore extends BaseWebStore<Record<string, unknown>> {}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

describe('BaseWebStore', () => {
  it('waits for IndexedDB reads before invoking the store callback', async () => {
    const store = new TestWebStore('test');
    const read = deferred<unknown>();
    const update = vi.fn();

    vi.spyOn(store, 'readFromDB').mockReturnValue(read.promise);
    store.get('authUrls', update);

    expect(store.readFromDB).toHaveBeenCalledWith('test:authUrls');
    expect(update).not.toHaveBeenCalled();

    const value = { dapp: { isAllowed: true } };

    read.resolve(value);
    await vi.waitFor(() => expect(update).toHaveBeenCalledWith(value));
  });
});
