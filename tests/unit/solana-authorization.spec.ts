import { AuthRequestHandler } from '@extension-base/services/request-service/handlers/AuthRequestHandler';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import type State from '@extension-base/background/handlers/State';
import type { AuthUrls } from '@extension-base/background/types/types';
import type { RequestService } from '@extension-base/services';

const storeState = vi.hoisted(() => ({
  authUrls: {} as AuthUrls,
}));

vi.mock('@extension-base/stores/Authorize', () => ({
  default: class MockAuthorizeStore {
    get(_key: string, update: (value: AuthUrls) => void): void {
      update(storeState.authUrls);
    }

    set(_key: string, value: AuthUrls, update?: () => void): void {
      storeState.authUrls = value;
      update?.();
    }
  },
}));

const SOLANA_ADDRESS = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const IROHA_ADDRESS = vectors.vectors[0].expected.iroha.nexus.i105;
const TAIRA_IROHA_ADDRESS = vectors.vectors[0].expected.iroha.taira.i105;
const SUBSTRATE_ADDRESS = 'substrate-address';
const EVM_ADDRESS = '0x0000000000000000000000000000000000000001';
const URL = 'https://dapp.example/swap';
const URL_KEY = 'dapp.example';

const createHandler = () => {
  const requestService = {
    popupOpen: vi.fn(),
    updateIcon: vi.fn(),
  } as unknown as RequestService;
  const state = {
    keyringService: {
      getAccount: vi.fn((address: string) =>
        address === SUBSTRATE_ADDRESS
          ? {
              meta: {
                ethereumAddress: EVM_ADDRESS,
              },
            }
          : undefined
      ),
    },
    networkService: {
      activeNetworkByEcosystem: {
        evm: [],
      },
    },
  } as unknown as State;

  return {
    handler: new AuthRequestHandler(requestService, state),
    requestService,
  };
};

function approveFirstRequest(handler: AuthRequestHandler, authorizedAccounts: string[]): void {
  const id = Object.keys(handler.authRequests)[0];

  if (!id) throw new Error('Expected pending auth request');

  handler.getAuthRequest(id).resolve({ authorizedAccounts });
}

describe('Solana origin-scoped authorization', () => {
  beforeEach(() => {
    storeState.authUrls = {};
  });

  it('stores Solana grants separately from substrate and evm accounts for one origin', async () => {
    const { handler, requestService } = createHandler();
    const authorization = handler.authorizeUrl(URL, {
      accountAuthType: 'solana',
      origin: 'Solana dApp',
    });

    await vi.waitFor(() => expect(requestService.popupOpen).toHaveBeenCalledOnce());

    approveFirstRequest(handler, [SOLANA_ADDRESS]);

    await expect(authorization).resolves.toBe(true);
    expect(storeState.authUrls[URL_KEY]).toMatchObject({
      accountAuthType: 'solana',
      authorizedAccounts: [],
      evmAuthorizedAccount: '',
      origin: 'Solana dApp',
      solanaAuthorizedAccount: SOLANA_ADDRESS,
    });
  });

  it('preserves existing substrate and evm grants when adding Solana for the same origin', async () => {
    storeState.authUrls = {
      [URL_KEY]: {
        accountAuthType: 'both',
        allowedAccountsMap: {},
        authorizedAccounts: [SUBSTRATE_ADDRESS],
        count: 0,
        currentEvmNetworkKey: 'Ethereum',
        evmAuthorizedAccount: EVM_ADDRESS,
        id: 'existing-auth',
        isAllowed: true,
        origin: 'Existing dApp',
        solanaAuthorizedAccount: '',
        url: URL,
      },
    };
    const { handler } = createHandler();
    const authorization = handler.authorizeUrl(URL, {
      accountAuthType: 'solana',
      origin: 'Solana dApp',
    });

    await vi.waitFor(() => expect(Object.keys(handler.authRequests)).toHaveLength(1));
    approveFirstRequest(handler, [SOLANA_ADDRESS]);

    await expect(authorization).resolves.toBe(true);
    expect(storeState.authUrls[URL_KEY]).toMatchObject({
      accountAuthType: 'all',
      authorizedAccounts: [SUBSTRATE_ADDRESS],
      evmAuthorizedAccount: EVM_ADDRESS,
      solanaAuthorizedAccount: SOLANA_ADDRESS,
    });

    await expect(
      handler.authorizeUrl(URL, {
        accountAuthType: 'solana',
        origin: 'Solana dApp',
      })
    ).resolves.toBe(false);
    expect(Object.keys(handler.authRequests)).toHaveLength(0);
  });

  it('stores Iroha grants separately from substrate, evm, and Solana accounts', async () => {
    storeState.authUrls = {
      [URL_KEY]: {
        accountAuthType: 'all',
        allowedAccountsMap: {},
        authorizedAccounts: [SUBSTRATE_ADDRESS],
        count: 0,
        currentEvmNetworkKey: 'Ethereum',
        evmAuthorizedAccount: EVM_ADDRESS,
        id: 'existing-auth',
        irohaAuthorizedAccount: '',
        isAllowed: true,
        origin: 'Existing dApp',
        solanaAuthorizedAccount: SOLANA_ADDRESS,
        url: URL,
      },
    };
    const { handler } = createHandler();
    const authorization = handler.authorizeUrl(URL, {
      accountAuthType: 'iroha',
      origin: 'SORA Nexus dApp',
    });

    await vi.waitFor(() => expect(Object.keys(handler.authRequests)).toHaveLength(1));
    approveFirstRequest(handler, [IROHA_ADDRESS]);

    await expect(authorization).resolves.toBe(true);
    expect(storeState.authUrls[URL_KEY]).toMatchObject({
      accountAuthType: 'all',
      authorizedAccounts: [SUBSTRATE_ADDRESS],
      evmAuthorizedAccount: EVM_ADDRESS,
      irohaAuthorizedAccount: IROHA_ADDRESS,
      solanaAuthorizedAccount: SOLANA_ADDRESS,
    });

    await expect(
      handler.authorizeUrl(URL, {
        accountAuthType: 'iroha',
        origin: 'SORA Nexus dApp',
      })
    ).resolves.toBe(false);
    expect(Object.keys(handler.authRequests)).toHaveLength(0);
  });

  it('requires a fresh Iroha approval when the requested network address changes', async () => {
    storeState.authUrls = {
      [URL_KEY]: {
        accountAuthType: 'all',
        allowedAccountsMap: {},
        authorizedAccounts: [SUBSTRATE_ADDRESS],
        count: 0,
        currentEvmNetworkKey: 'Ethereum',
        evmAuthorizedAccount: EVM_ADDRESS,
        id: 'existing-auth',
        irohaAuthorizedAccount: IROHA_ADDRESS,
        isAllowed: true,
        origin: 'Existing dApp',
        solanaAuthorizedAccount: SOLANA_ADDRESS,
        url: URL,
      },
    };
    const { handler } = createHandler();

    await expect(
      handler.authorizeUrl(URL, {
        accountAuthType: 'iroha',
        allowedAccounts: [IROHA_ADDRESS],
        origin: 'SORA Nexus dApp',
      })
    ).resolves.toBe(false);
    expect(Object.keys(handler.authRequests)).toHaveLength(0);

    const authorization = handler.authorizeUrl(URL, {
      accountAuthType: 'iroha',
      allowedAccounts: [TAIRA_IROHA_ADDRESS],
      origin: 'Taira dApp',
    });

    await vi.waitFor(() => expect(Object.keys(handler.authRequests)).toHaveLength(1));
    approveFirstRequest(handler, [TAIRA_IROHA_ADDRESS]);

    await expect(authorization).resolves.toBe(true);
    expect(storeState.authUrls[URL_KEY]).toMatchObject({
      accountAuthType: 'all',
      irohaAuthorizedAccount: TAIRA_IROHA_ADDRESS,
      solanaAuthorizedAccount: SOLANA_ADDRESS,
    });
  });
});
