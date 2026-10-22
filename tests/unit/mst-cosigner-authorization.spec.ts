import Tabs from '@extension-base/background/handlers/Tabs';
import { AuthRequestHandler } from '@extension-base/services/request-service/handlers/AuthRequestHandler';
import type State from '@extension-base/background/handlers/State';
import type { AuthUrls, DecryptForCosignerData, EncryptByCosignerData, Port } from '@extension-base/background/types/types';
import type { RequestService } from '@extension-base/services';
import { CURRENT_WALLET_SECURITY_GENERATION } from '@/util/walletSecurity';

const storeState = vi.hoisted(() => ({ authUrls: {} as AuthUrls }));

// The unrelated signing helpers import the application's background singleton.
// Keep this authorization test isolated from wallet initialization and network services.
vi.mock('@extension-base/background/handlers', () => ({ state: {} }));

vi.mock('@extension-base/stores/Authorize', () => ({
  default: class {
    get(_key: string, update: (value: AuthUrls) => void): void {
      update(storeState.authUrls);
    }
  },
}));

const ORIGIN = 'https://mst-audit.example';
const ACCOUNT_A = 'synthetic-approved-account';
const ACCOUNT_B = 'synthetic-unapproved-account';

function createTabs() {
  const keyringService = {
    encodeAddress: (address: string) => address,
    getAllAccounts: vi.fn(() => [
      { address: ACCOUNT_A, meta: { walletSecurityGeneration: CURRENT_WALLET_SECURITY_GENERATION } },
    ]),
    decryptForCosigner: vi.fn().mockReturnValue({ synthetic: 'decrypted data' }),
    encryptByCosigner: vi.fn().mockReturnValue({ synthetic: 'encrypted data' }),
  };
  const state = { keyringService, requestService: {} as RequestService };
  const authorization = new AuthRequestHandler({} as RequestService, state as unknown as State);

  state.requestService = {
    ensureUrlAuthorized: authorization.ensureUrlAuthorized.bind(authorization),
    ensureAccountAuthorized: authorization.ensureAccountAuthorized.bind(authorization),
  } as unknown as RequestService;

  return { tabs: new Tabs(state as unknown as State), keyringService };
}

describe('MST cosigner account authorization', () => {
  beforeEach(() => {
    storeState.authUrls = {
      [ORIGIN]: {
        id: ORIGIN,
        url: ORIGIN,
        origin: 'Synthetic audit dApp',
        count: 0,
        isAllowed: true,
        authorizedAccounts: [ACCOUNT_A],
        evmAuthorizedAccount: '',
        allowedAccountsMap: {},
      },
    };
  });

  for (const operation of ['decrypt', 'encrypt'] as const) {
    const message = operation === 'decrypt' ? 'pub(decrypt.cosigner)' : 'pub(encrypt.cosigner)';
    const method = operation === 'decrypt' ? 'decryptForCosigner' : 'encryptByCosigner';
    const request = (address: string): DecryptForCosignerData | EncryptByCosignerData =>
      operation === 'decrypt'
        ? { address, data: {} as never, encryptorPublicKey: new Uint8Array([1]) }
        : { address, data: 'synthetic data', cosigners: {} };

    it(`rejects ${operation} for an account outside a connected site's grant`, async () => {
      const { tabs, keyringService } = createTabs();

      await expect(tabs.handle('audit', message, request(ACCOUNT_B), ORIGIN, {} as Port)).rejects.toThrow(/not authorized/i);
      expect(keyringService[method]).not.toHaveBeenCalled();
    });

    it(`rejects ${operation} from a site without a grant`, async () => {
      storeState.authUrls[ORIGIN].isAllowed = false;
      const { tabs, keyringService } = createTabs();

      await expect(tabs.handle('audit', message, request(ACCOUNT_A), ORIGIN, {} as Port)).rejects.toThrow(/not been enabled/i);
      expect(keyringService[method]).not.toHaveBeenCalled();
    });

    it(`rejects ${operation} after the account grant is revoked`, async () => {
      storeState.authUrls[ORIGIN].authorizedAccounts = [];
      const { tabs, keyringService } = createTabs();

      await expect(tabs.handle('audit', message, request(ACCOUNT_A), ORIGIN, {} as Port)).rejects.toThrow(/not authorized/i);
      expect(keyringService[method]).not.toHaveBeenCalled();
    });

    it(`allows ${operation} for the explicitly shared account`, async () => {
      const { tabs, keyringService } = createTabs();
      const payload = request(ACCOUNT_A);

      await expect(tabs.handle('audit', message, payload, ORIGIN, {} as Port)).resolves.toEqual({
        synthetic: operation === 'decrypt' ? 'decrypted data' : 'encrypted data',
      });
      expect(keyringService[method]).toHaveBeenCalledExactlyOnceWith(payload);
    });

    it(`rejects ${operation} for a shared wallet from before the security update`, async () => {
      const { tabs, keyringService } = createTabs();
      keyringService.getAllAccounts.mockReturnValue([{ address: ACCOUNT_A, meta: {} } as never]);

      await expect(tabs.handle('audit', message, request(ACCOUNT_A), ORIGIN, {} as Port)).rejects.toThrow(/recovery-only/i);
      expect(keyringService[method]).not.toHaveBeenCalled();
    });
  }
});
