import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import { ADD_WALLET_PATH, PASSWORD_SETUP_PATH } from '@/router/accountFlowPaths';
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: ADD_WALLET_PATH, name: 'AddWallet', component: {} },
    { path: PASSWORD_SETUP_PATH, name: 'ChangePassword', component: {} },
  ],
});

describe('account-flow route persistence', () => {
  it.each(['create', 'import'])('retains %s and ecosystem when reopening password setup', (type) => {
    for (const walletEcosystem of ['substrate', 'ton']) {
      const params = { name: 'AddWallet', type, walletEcosystem };
      const target = router.resolve({ name: 'ChangePassword', params });
      expect(router.resolve(target.fullPath).params).toEqual(params);
      const account = router.resolve({ name: 'AddWallet', params: { type, walletEcosystem } });
      expect(router.resolve(account.fullPath).params).toEqual({ type, walletEcosystem });
    }
  });
  it('keeps the original URLs valid', () => {
    expect(router.resolve('/change-password').name).toBe('ChangePassword');
    expect(router.resolve('/add-wallet/import').name).toBe('AddWallet');
  });
});
