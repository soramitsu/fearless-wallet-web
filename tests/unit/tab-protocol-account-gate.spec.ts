import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import Tabs from '@extension-base/background/handlers/Tabs';
import { KeyringService } from '@extension-base/services/keyring-service';
import type { MessageTypes, Port } from '@extension-base/background/types/types';

const mocks = vi.hoisted(() => ({ evmRequest: vi.fn(), permission: vi.fn(), events: vi.fn() }));
vi.mock('@polkadot/phishing', () => ({ checkIfDenied: vi.fn(async () => false) }));
vi.mock('@subwallet/keyring/pair/nobody', () => ({ nobody: () => { throw new Error('unused'); } }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: {
  runtime: { getURL: (path: string) => path, lastError: undefined },
  storage: {
    local: {
      set: (_data: unknown, done?: () => void) => done?.(),
      get: (_keys: unknown, done: (data: object) => void) => done({}),
      remove: (_keys: unknown, done?: () => void) => done?.(),
    },
    onChanged: { addListener: vi.fn() },
  },
} }));
vi.mock('@extension-base/services/eip-service', () => ({ EipService: class {
  handleEvmRequest = mocks.evmRequest;
  requestEvmPermission = mocks.permission;
  evmSubscribeEvents = mocks.events;
} }));
vi.mock('@extension-base/services/solana-rpc-service', () => ({ createClusterBoundSolanaRpcClient: () => ({}) }));

type Account = { address: string; meta: Record<string, unknown> };
const url = 'https://public.example';
const evmKey: Account = { address: `0x${'ab'.repeat(20)}`, meta: { name: 'Imported EVM key', walletEcosystem: 'evm' } };
const mobile: Account = {
  address: 'mobile-substrate',
  meta: { isMobile: true, ethereumAddress: `0x${'cd'.repeat(20)}` },
};
const substrateOnly: Account = { address: 'substrate-root', meta: { walletEcosystem: 'substrate' } };
const solanaOnly: Account = {
  address: 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk',
  meta: { walletEcosystem: 'solana' },
};
const port = { onDisconnect: { addListener: vi.fn() } } as unknown as Port;
let authorizeUrl: ReturnType<typeof vi.fn>;

// The keyring's own Substrate filter runs over the fixture accounts.
function tabsFor(accounts: Account[]) {
  const keyringService = {
    getAllAccounts: () => accounts,
    getAllSubstrateAccounts(this: { getAllAccounts: () => Account[] }) {
      return KeyringService.prototype.getAllSubstrateAccounts.call(this as never);
    },
    accountSubject: new BehaviorSubject({}),
    addressSubject: new BehaviorSubject({}),
  };
  const requestService = { ensureUrlAuthorized: vi.fn(async () => true), authorizeUrl };
  const tabs = new Tabs({ keyringService, requestService } as never);
  return (type: MessageTypes, request: unknown) => tabs.handle('page-request', type, request as never, url, port);
}

beforeEach(() => {
  vi.clearAllMocks();
  authorizeUrl = vi.fn(async () => true);
  mocks.evmRequest.mockResolvedValue('0x1');
  mocks.permission.mockResolvedValue([]);
  mocks.events.mockResolvedValue(true);
});

describe('dApp requests are gated on accounts of their own protocol', () => {
  it.each([
    ['an imported EVM key', evmKey],
    ['a mobile account with an EVM address', mobile],
  ])('answers EVM requests for a wallet whose only account is %s', async (_name, account) => {
    const call = tabsFor([account]);

    expect(await call('evm(request)', { method: 'eth_chainId' })).toBe('0x1');
    await call('evm(authorizeUrl)', { method: '', params: { origin: 'Public app' } });
    expect(await call('evm(events.subscribe)', null)).toBe(true);
    expect(mocks.evmRequest).toHaveBeenCalledOnce();
    expect(mocks.permission).toHaveBeenCalledOnce();
    expect(mocks.events).toHaveBeenCalledOnce();
  });

  it.each([
    ['an imported EVM key', [evmKey]],
    ['a Solana key', [solanaOnly]],
    ['no account', []],
  ])('fails Substrate enable() without a prompt for a wallet with %s', async (_name, accounts) => {
    const call = tabsFor(accounts);

    await expect(call('pub(authorize.tab)', { origin: 'Public app' })).rejects.toThrow('no Substrate account');
    expect(authorizeUrl).not.toHaveBeenCalled();
  });

  it.each([
    ['a Substrate account without an EVM address', [substrateOnly]],
    ['a Solana key', [solanaOnly]],
  ])('still refuses EVM requests for a wallet with only %s', async (_name, accounts) => {
    const call = tabsFor(accounts);

    for (const type of ['evm(request)', 'evm(authorizeUrl)', 'evm(events.subscribe)'] as const)
      expect(await call(type, { method: 'eth_requestAccounts', params: { origin: 'Public app' } })).toBeUndefined();
    expect(mocks.evmRequest).not.toHaveBeenCalled();
    expect(mocks.permission).not.toHaveBeenCalled();
    expect(mocks.events).not.toHaveBeenCalled();
  });

  it('asks a Substrate wallet to authorize the site', async () => {
    const call = tabsFor([substrateOnly]);

    expect(await call('pub(authorize.tab)', { origin: 'Public app' })).toBe(true);
    expect(authorizeUrl).toHaveBeenCalledWith(url, { origin: 'Public app' }, expect.any(AbortSignal));
  });
});
