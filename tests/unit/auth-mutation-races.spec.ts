import { beforeEach, describe, expect, it, vi } from 'vitest';
import State from '@extension-base/background/handlers/State';
import Extension from '@extension-base/background/handlers/Extension';
import Tabs from '@extension-base/background/handlers/Tabs';
import { RequestService } from '@extension-base/services/request-service';
import { AuthRequestHandler } from '@extension-base/services/request-service/handlers/AuthRequestHandler';
import { captureEvmSigningContext } from '@extension-base/services/request-service/handlers/evmSigningContext';
import { EipService } from '@extension-base/services/eip-service';
import type { AuthUrls } from '@extension-base/background/types/types';
import { CURRENT_WALLET_SECURITY_GENERATION } from '@/util/walletSecurity';

const storage = vi.hoisted(() => ({
  data: {} as AuthUrls,
  delayReads: false,
  delayWrites: false,
  reads: [] as Array<(value: AuthUrls) => void>,
  writes: [] as Array<() => void>,
}));
vi.mock('@extension-base/stores/Authorize', () => ({
  default: class {
    getAndWait(key: string): Promise<AuthUrls> {
      return new Promise((resolve) => this.get(key, resolve));
    }
    setAndWait(key: string, value: AuthUrls): Promise<void> {
      return new Promise((resolve) => this.set(key, value, resolve));
    }
    get(_key: string, callback: (value: AuthUrls) => void) {
      if (storage.delayReads) storage.reads.push(callback);
      else callback(structuredClone(storage.data));
    }
    set(_key: string, value: AuthUrls, callback?: () => void) {
      const finish = () => {
        storage.data = structuredClone(value);
        callback?.();
      };
      storage.writes.push(finish);
      if (!storage.delayWrites) finish();
    }
  },
}));
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {} }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@polkadot/phishing', () => ({ checkIfDenied: vi.fn(async () => false) }));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));

// Public fixture addresses; these tests never export a key or contact a provider.
const first = 'https://first.public.example';
const second = 'https://second.public.example';
const address = `0x${'11'.repeat(20)}`;
const solana = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const grants = (): AuthUrls =>
  Object.fromEntries(
    [first, second].map((url) => [
      url,
      {
        id: `grant:${url}`,
        count: 0,
        isAllowed: true,
        origin: url,
        url,
        accountAuthType: 'both',
        authorizedAccounts: ['public-root'],
        evmAuthorizedAccount: address,
        solanaAuthorizedAccount: solana,
        irohaAuthorizedAccount: 'public-iroha-fixture',
        currentEvmNetworkKey: 'Ethereum',
        allowedAccountsMap: {},
      },
    ])
  );

let state: State, requests: RequestService, auth: AuthRequestHandler, extension: Extension, tabs: Tabs, eip: EipService;
function initialize() {
  requests = Object.create(RequestService.prototype) as RequestService;
  Object.assign(requests, { popupOpen: vi.fn(), updateIcon: vi.fn() });
  state = Object.assign(Object.create(State.prototype), {
    requestService: requests,
    networkService: {
      getNetworkJson: () => ({ name: 'Other', active: false }),
      networkMap: {
        Ethereum: {
          name: 'Ethereum',
          chainId: '1',
          genesisHash: '0x1234',
          ecosystem: 'ethereum',
          disabled: false,
          assets: [{ symbol: 'ETH', precision: 18, isNative: true }],
        },
      },
    },
    setActiveNetworks: vi.fn(async () => {}),
    keyringService: {
      tonKeyring: { getAccounts: () => [] },
      getAccount: () => ({ meta: { ethereumAddress: address } }),
      getSubstrateAddress: () => 'public-root',
      getEthereumAddress: () => address,
      getAllAccounts: () => [{ address: 'public-root', meta: { name: 'Public fixture', ethereumAddress: address, solanaAddress: solana, walletSecurityGeneration: CURRENT_WALLET_SECURITY_GENERATION } }],
      getAddresses: () => [],
      isMobileAccount: () => false,
    },
  }) as State;
  auth = new AuthRequestHandler(requests, state);
  Object.assign(requests, { authRequestHandler: auth });
  extension = new Extension(state);
  tabs = new Tabs(state);
  eip = new EipService(state);
}
beforeEach(async () => {
  storage.data = grants();
  storage.delayReads = false;
  storage.delayWrites = false;
  storage.reads = [];
  storage.writes = [];
  initialize();
  await auth.getAuthList();
});
const revoke = (url: string) =>
  eip.handleEvmRequest('public-revoke', url, { method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] });
const admit = () => captureEvmSigningContext(state, first, 'personal_sign', ['0x1234', address]);

describe('authorization mutation races through production callers', () => {
  it('persists an empty reset while an obsolete startup read is outstanding', async () => {
    storage.delayReads = true; storage.delayWrites = true; initialize();
    const read = auth.getAuthList();
    const reset = auth.resetWallet();
    storage.reads[0](grants());
    expect(await read).toEqual({});
    await vi.waitFor(() => expect(storage.writes).toHaveLength(1));
    storage.writes[0](); await reset;
    storage.delayReads = false; initialize();
    expect(await auth.getAuthList()).toEqual({});
  });
  it('does not acknowledge popup approval until the authorization write completes', async () => {
    storage.delayWrites = true;
    const dapp = auth.authorizeUrl(first, { origin:first, accountAuthType:'solana', reConfirm:true });
    await vi.waitFor(() => expect(auth.numAuthRequests).toBe(1));
    const request = Object.values(auth.authRequests)[0];
    let done = false;
    const action = extension.authorizeApprove({id:request.id, authorizedAccounts:[solana]}).then(() => {done = true;});
    await vi.waitFor(() => expect(storage.writes).toHaveLength(1));
    expect(done).toBe(false);
    storage.writes[0](); await action; await expect(dapp).resolves.toBe(true);
  });

  it('projects account display keys without persisting a read-only authorization list', async () => {
    const list = await extension.authList();
    expect(Object.keys(list[first].allowedAccountsMap)).toEqual(['public-root']);
    expect(storage.writes).toHaveLength(0);
    list[first].isAllowed = false;
    expect((await auth.getAuthList())[first].isAllowed).toBe(true);
    await auth.setAuthorize({});
    expect(await extension.authList()).toEqual({});
  });
  it('preserves both concurrent EVM origin revocations', async () => {
    await Promise.all([revoke(first), revoke(second)]);
    const current = await auth.getAuthList();
    expect(current[first].evmAuthorizedAccount).toBe('');
    expect(current[second].evmAuthorizedAccount).toBe('');
    await expect(admit()).rejects.toThrow();
  });

  it.each(['solana', 'iroha'] as const)('does not undo an EVM revocation during a concurrent %s disconnect', async (kind) => {
    await Promise.all([
      revoke(first),
      kind === 'solana' ? tabs.solanaDisconnect(second) : tabs.irohaDisconnect(second),
    ]);
    const current = await auth.getAuthList();
    expect(current[first].evmAuthorizedAccount).toBe('');
    expect(current[second][kind === 'solana' ? 'solanaAuthorizedAccount' : 'irohaAuthorizedAccount']).toBe('');
  });

  it('does not undo an EVM revocation while removing another origin', async () => {
    await Promise.all([revoke(first), extension.removeAuthorization(second)]);
    const current = await auth.getAuthList();
    expect(current[first].evmAuthorizedAccount).toBe('');
    expect(current[second]).toBeUndefined();
  });

  it('does not undo an EVM revocation while updating another origin account scope', async () => {
    await Promise.all([revoke(first), requests.updateAuthorizedAccounts([[second, [], 'solana']])]);
    const current = await auth.getAuthList();
    expect(current[first].evmAuthorizedAccount).toBe('');
    expect(current[second].solanaAuthorizedAccount).toBe('');
  });

  it.each(['revocation', 'removal', 'replacement'] as const)(
    'does not restore or mutate a changed grant after network activation: %s',
    async (change) => {
      let finish!: () => void;
      vi.mocked(state.setActiveNetworks).mockImplementationOnce(
        () => new Promise<void>((resolve) => { finish = resolve; })
      );
      const pending = state.switchEvmNetworkByUrl(first, 'Other');
      const outcome = pending.then(() => 'resolved', () => 'rejected');
      await vi.waitFor(() => expect(state.setActiveNetworks).toHaveBeenCalledOnce());
      if (change === 'revocation') await revoke(first);
      else if (change === 'removal') await extension.removeAuthorization(first);
      else auth.setAuthorize({ ...grants(), [first]: { ...grants()[first], id: 'replacement' } });
      finish();
      expect(await outcome).toBe('rejected');
      const current = await auth.getAuthList();
      if (change === 'removal') expect(current[first]).toBeUndefined();
      else {
        expect(current[first].currentEvmNetworkKey).toBe('Ethereum');
        if (change === 'revocation') expect(current[first].evmAuthorizedAccount).toBe('');
        else expect(current[first].id).toBe('replacement');
      }
    }
  );

  it('preserves a concurrent other-origin revocation during network activation', async () => {
    let finish!: () => void;
    vi.mocked(state.setActiveNetworks).mockImplementationOnce(
      () => new Promise<void>((resolve) => { finish = resolve; })
    );
    const pending = state.switchEvmNetworkByUrl(first, 'Other');
    await vi.waitFor(() => expect(state.setActiveNetworks).toHaveBeenCalledOnce());
    await revoke(second);
    finish();
    await pending;
    const current = await auth.getAuthList();
    expect(current[first].currentEvmNetworkKey).toBe('Other');
    expect(current[second].evmAuthorizedAccount).toBe('');
  });

  it('rejects network activation after an EVM grant was revoked and restored to the same value', async () => {
    let finish!: () => void;
    vi.mocked(state.setActiveNetworks).mockImplementationOnce(
      () => new Promise<void>((resolve) => { finish = resolve; })
    );
    const pending = state.switchEvmNetworkByUrl(first, 'Other');
    const outcome = pending.then(() => 'resolved', () => 'rejected');
    await vi.waitFor(() => expect(state.setActiveNetworks).toHaveBeenCalledOnce());
    await revoke(first);
    await requests.updateAuthorizedAccounts([[first, [address], 'evm']]);
    finish();
    expect(await outcome).toBe('rejected');
    const current = await auth.getAuthList();
    expect(current[first].evmAuthorizedAccount).toBe(address);
    expect(current[first].currentEvmNetworkKey).toBe('Ethereum');
  });

  it('queues an initial intent before a newer write made by an initial-load waiter', async () => {
    storage.delayReads = true;
    storage.delayWrites = true;
    initialize();
    let newer!: Promise<void>;
    const reader = auth.getAuthorize(() => {
      newer = auth.setAuthorize({ ...grants(), [first]: { ...grants()[first], isAllowed: false } });
    });
    const initial = auth.setAuthorize(grants());
    storage.reads[0](grants());
    await reader;
    expect((await auth.getAuthList())[first]?.isAllowed).not.toBe(true);
    await vi.waitFor(() => expect(storage.writes).toHaveLength(1));
    storage.writes[0](); await initial;
    expect((await auth.getAuthList())[first]?.isAllowed).not.toBe(true);
    await vi.waitFor(() => expect(storage.writes).toHaveLength(2));
    storage.writes[1](); await newer;
    expect((await auth.getAuthList())[first].isAllowed).toBe(false);
    expect(storage.data[first].isAllowed).toBe(false);
  });

  it('preserves a current EVM revocation when approving another ecosystem', async () => {
    const pending = auth.authorizeUrl(first, { origin: first, accountAuthType: 'solana', reConfirm: true });
    await vi.waitFor(() => expect(auth.numAuthRequests).toBe(1));
    await revoke(first);
    const request = Object.values(auth.authRequests)[0];
    request.resolve({ authorizedAccounts: [solana] });
    await expect(pending).resolves.toBe(true);
    const current = await auth.getAuthList();
    expect(current[first].solanaAuthorizedAccount).toBe(solana);
    expect(current[first].evmAuthorizedAccount).toBe('');
    await expect(admit()).rejects.toThrow();
  });

  it('does not revive other denied protocol scopes when explicitly reauthorizing Solana', async () => {
    await auth.setAuthorize({ ...grants(), [first]: { ...grants()[first], isAllowed: false } });
    const pending = auth.authorizeUrl(first, { origin: first, accountAuthType: 'solana', reConfirm: true });
    await vi.waitFor(() => expect(auth.numAuthRequests).toBe(1));
    Object.values(auth.authRequests)[0].resolve({ authorizedAccounts: [solana] });
    await expect(pending).resolves.toBe(true);
    const current = (await auth.getAuthList())[first];
    expect(current.isAllowed).toBe(true);
    expect(current.solanaAuthorizedAccount).toBe(solana);
    expect(current.evmAuthorizedAccount).toBe('');
    expect(current.authorizedAccounts).toEqual([]);
    expect(current.irohaAuthorizedAccount).toBe('');
    expect(current.accountAuthType).toBe('solana');
    expect(current.currentEvmNetworkKey).toBe('Ethereum');
    await expect(admit()).rejects.toThrow();
  });

  it.each(['removal', 'replacement', 'denial'] as const)(
    'rejects an obsolete cross-ecosystem approval after origin %s',
    async (change) => {
      const pending = auth.authorizeUrl(first, { origin: first, accountAuthType: 'solana', reConfirm: true });
      const outcome = pending.then(() => 'resolved', () => 'rejected');
      await vi.waitFor(() => expect(auth.numAuthRequests).toBe(1));
      const request = Object.values(auth.authRequests)[0];
      if (change === 'removal') await extension.removeAuthorization(first);
      else auth.setAuthorize({
        ...grants(),
        [first]: { ...grants()[first], ...(change === 'replacement' ? { id: 'replacement' } : { isAllowed: false }) },
      });
      await expect(request.resolve({ authorizedAccounts: [solana] })).rejects.toThrow('authorization changed');
      expect(await outcome).toBe('rejected');
      expect(auth.numAuthRequests).toBe(0);
      const current = await auth.getAuthList();
      if (change === 'removal') expect(current[first]).toBeUndefined();
      else if (change === 'replacement') expect(current[first].id).toBe('replacement');
      else expect(current[first].isAllowed).toBe(false);
    }
  );
});
