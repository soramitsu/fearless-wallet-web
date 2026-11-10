import { describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import EquilibriumBalanceService from '@extension-base/services/balance-service/EquilibriumBalanceService';
import type { ApiPromise } from '@polkadot/api';
import type State from '@extension-base/background/handlers/State';

const codec = (value: string) => ({ toString: () => value, toNumber: () => { throw new Error('unsafe conversion'); } });

describe('Equilibrium balance precision', () => {
  it('keeps codec precision above the JavaScript safe-integer limit and cleans up its subscription', () => {
    const updates = new Subject();
    const setBalanceItem = vi.fn();
    const service = new EquilibriumBalanceService({
      networkService: { networkMap: { equilibrium: { name: 'Equilibrium', assets: [
        { currencyId: '1', symbol: 'eq', id: 'eq', precision: 9 },
        { currencyId: '2', symbol: 'zero', id: 'zero', precision: 9 },
      ] } } },
      balanceService: { setBalanceItem },
      keyringService: { getSubstrateAddress: () => 'alice' },
    } as unknown as State);
    const unsubscribe = service.subscribeBalance('alice', { rx: { query: { system: { account: () => updates } } } } as unknown as ApiPromise);
    updates.next({ data: { asV0: { lock: codec('9007199254740993'), balance: [[codec('1'), { asPositive: codec('9007199254740995') }]] } } });
    expect(setBalanceItem).toHaveBeenCalledWith('Equilibrium', expect.objectContaining({
      id: 'eq', locked: '9007199.254740993', transferable: '9007199.254740995', total: '18014398.509481988',
    }), 'alice');
    expect(setBalanceItem).toHaveBeenCalledWith('Equilibrium', expect.objectContaining({ id: 'zero', transferable: '0' }), 'alice');
    unsubscribe();
    expect(updates.observed).toBe(false);
  });
});
