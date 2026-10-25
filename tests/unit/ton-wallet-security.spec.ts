import { describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { TonKeyringService } from '@extension-base/services/keyring-service/TonKeyring';
import { WalletEcosystem } from '@/interfaces';

vi.mock('@extension-base/stores/TonStore', () => ({ tonStore: { all: vi.fn() } }));

describe('TON wallet security inventory', () => {
  it('exposes only the persisted security generation alongside public account identity', () => {
    const service = Object.create(TonKeyringService.prototype) as TonKeyringService;
    Object.defineProperty(service, 'accountSubject', { value: new BehaviorSubject({
      fixture: {
        name: 'TON fixture', walletEcosystem: WalletEcosystem.Ton,
        json: { address: 'ton-public-fixture', meta: { walletSecurityGeneration: 1, cipherSeed: 'private-ciphertext' } },
      },
    }) });
    expect(service.getAccounts()).toEqual([{
      address: 'ton-public-fixture', walletEcosystem: WalletEcosystem.Ton,
      meta: { name: 'TON fixture', walletEcosystem: WalletEcosystem.Ton, isMobile: false, walletSecurityGeneration: 1 },
    }]);
    expect(JSON.stringify(service.getAccounts())).not.toContain('private-ciphertext');
  });
});
