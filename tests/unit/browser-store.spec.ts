import browserStore from '@/util/browserStore';

function createStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe('browserStore shim', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createStorage(),
    });
    window.localStorage.clear();
  });

  it('round-trips structured values without eval-backed JSON parsing', () => {
    const value = { address: 'wallet-1', nested: { enabled: true }, assets: ['xor', 'dot'] };

    browserStore.set('account:1', value);

    expect(browserStore.get('account:1')).toEqual(value);
    expect(window.localStorage.getItem('account:1')).toBe(JSON.stringify(value));
  });

  it('iterates stored keys and preserves fallback behavior', () => {
    browserStore.set('a', 1);
    browserStore.set('b', { value: 2 });

    const entries: Array<[string, unknown]> = [];
    browserStore.each((value, key) => entries.push([key, value]));

    expect(entries).toEqual(
      expect.arrayContaining([
        ['a', 1],
        ['b', { value: 2 }],
      ])
    );
    expect(browserStore.get('missing', 'fallback')).toBe('fallback');
  });

  it('does not execute malformed storage payloads', () => {
    window.localStorage.setItem('legacy', '({ attack: true })');

    expect(browserStore.get('legacy')).toBe('({ attack: true })');
  });
});
