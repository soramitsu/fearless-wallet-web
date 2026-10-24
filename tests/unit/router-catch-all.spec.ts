import { createMemoryHistory, createRouter } from 'vue-router';

vi.mock('@/router/helpers', () => ({
  getStakingNetwork: vi.fn(),
  haveAuthRequests: vi.fn(),
  haveMetaRequests: vi.fn(),
  hasSelectedWallet: vi.fn(),
  haveSignRequests: vi.fn(),
}));
vi.mock('@/extension/messaging', () => ({ keyringIsLocked: vi.fn() }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: vi.fn() }));
vi.mock('@/stores/extension', () => ({ useExtensionStore: vi.fn() }));
vi.mock('@/stores/staking', () => ({ useStakingStore: vi.fn() }));
vi.mock('@/screens/welcome/Unlock.vue', () => ({ default: {} }));
vi.mock('@/screens/welcome/Welcome.vue', () => ({ default: {} }));
vi.mock('@/screens/main/Main.vue', () => ({ default: {} }));
vi.mock('@/screens/wallet&asset/asset/Asset.vue', () => ({ default: {} }));
vi.mock('@/screens/wallet&asset/wallet/Wallet.vue', () => ({ default: {} }));
vi.mock('@/screens/accounts/AccountsLayout.vue', () => ({ default: {} }));
vi.mock('@/screens/extension-ui/DAppsAuths.vue', () => ({ default: {} }));
vi.mock('@/screens/wallet&asset/wallet/Currencies.vue', () => ({ default: {} }));

describe('router catch-all compatibility', () => {
  it('matches unknown routes with the Vue Router 4/5 path-match syntax', async () => {
    // Node exposes an unusable localStorage stub unless a backing file was
    // configured. Ensure modules imported by the route table see happy-dom's
    // in-memory implementation instead.
    const values = new Map<string, string>();
    const localStorageStub: Storage = {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => values.delete(key),
      setItem: (key, value) => values.set(key, value),
    };

    const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: localStorageStub,
      });

      const { default: routes, Components } = await import('@/router/routes');
      const router = createRouter({
        history: createMemoryHistory(),
        routes,
      });

      const rootMatch = router.resolve('/');
      const match = router.resolve('/definitely-not-a-real-fearless-route');
      const nestedMatch = router.resolve('/nested/not-real?attempt=shadow-known-route#fragment');
      const accountsMatch = router.resolve('/accounts');
      const authManagementMatch = router.resolve('/auth-management');

      expect(routes.at(-1)?.path).toBe('/:pathMatch(.*)*');
      expect(routes.filter(({ path }) => path.includes('pathMatch'))).toHaveLength(1);
      expect(rootMatch.matched.at(-1)?.path).toBe('/:pathMatch(.*)*');
      expect(match.matched.at(-1)?.path).toBe('/:pathMatch(.*)*');
      expect(nestedMatch.matched.at(-1)?.path).toBe('/:pathMatch(.*)*');
      expect(nestedMatch.params.pathMatch).toEqual(['nested', 'not-real']);
      expect(nestedMatch.query).toEqual({ attempt: 'shadow-known-route' });
      expect(nestedMatch.hash).toBe('#fragment');
      expect(accountsMatch.matched.at(-1)?.redirect).toEqual({ name: Components.AccountSetting });
      expect(authManagementMatch.matched.at(-1)?.redirect).toEqual({
        name: Components.DAppsAuths,
        params: { type: 'substrate' },
      });
      expect(warn.mock.calls.flat().join('\n')).not.toMatch(/catch.?all|pathMatch.*deprecated/i);
    } finally {
      warn.mockRestore();
      if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
});
