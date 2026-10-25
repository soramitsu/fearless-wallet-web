import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthRequestHandler } from '@extension-base/services/request-service/handlers/AuthRequestHandler';
import type { AuthUrls } from '@extension-base/background/types/types';
import type { RequestService } from '@extension-base/services/request-service';
import type State from '@extension-base/background/handlers/State';

// Controlled storage adapter with the same callback / rejecting promise APIs as
// the actual stores. No key material, provider or network access.
const storage = vi.hoisted(() => ({
  data: {} as AuthUrls,
  readError: false,
  writeError: false,
  delayWrites: false,
  writes: [] as Array<() => void>,
}));
vi.mock('@extension-base/stores/Authorize', () => ({
  default: class {
    get(_key: string, cb: (value: AuthUrls) => void) {
      if (!storage.readError) cb(structuredClone(storage.data));
    }
    getAndWait() {
      return storage.readError
        ? Promise.reject(new Error('Public storage read failure'))
        : Promise.resolve(structuredClone(storage.data));
    }
    set(_key: string, value: AuthUrls, cb?: () => void) {
      void this.setAndWait(_key, value)
        .then(() => cb?.())
        .catch(() => undefined);
    }
    setAndWait(_key: string, value: AuthUrls) {
      const snapshot = structuredClone(value);
      return new Promise<void>((resolve, reject) => {
        const finish = () => {
          if (storage.writeError) reject(new Error('Public storage write failure'));
          else {
            storage.data = snapshot;
            resolve();
          }
        };
        storage.writes.push(finish);
        if (!storage.delayWrites) finish();
      });
    }
  },
}));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: { runtime: { getURL: (p: string) => p } } }));
const first = 'https://first.public.example',
  second = 'https://second.public.example';
const evm = `0x${'11'.repeat(20)}`,
  solana = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const grant = (url = first) => ({
  id: 'public-grant',
  origin: url,
  url,
  count: 0,
  isAllowed: true,
  accountAuthType: 'all' as const,
  authorizedAccounts: ['public-root'],
  evmAuthorizedAccount: evm,
  solanaAuthorizedAccount: solana,
  irohaAuthorizedAccount: '',
  currentEvmNetworkKey: 'Ethereum',
  allowedAccountsMap: {},
});
const create = () =>
  new AuthRequestHandler(
    { updateIcon: vi.fn(), popupOpen: vi.fn() } as unknown as RequestService,
    {
      networkService: {},
      keyringService: {
        encodeAddress: (address: string) => address,
        getAccount: () => ({ meta: { ethereumAddress: evm } }),
      },
    } as unknown as State
  );
let auth: AuthRequestHandler;
beforeEach(async () => {
  storage.data = {};
  storage.readError = false;
  storage.writeError = false;
  storage.delayWrites = false;
  storage.writes = [];
  auth = create();
  await auth.getAuthList();
});
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const outcome = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ status: 'resolved', value }),
    (error) => ({ status: 'rejected', error })
  );
const expectBlocked = (protocol: 'evm' | 'substrate' | 'solana') => {
  if (protocol === 'evm') {
    let allowed = false;
    try {
      allowed = auth.getEvmAuthorizationSnapshot(first).authorization?.isAllowed === true;
    } catch {
      /* An unloaded snapshot also denies. */
    }
    expect(allowed).toBe(false);
  } else
    expect(() =>
      auth.getSigningAuthorizationRevision(first, protocol, protocol === 'substrate' ? 'public-root' : solana)
    ).toThrow();
};
describe('durable site authorization', () => {
  it('durably authorizes a standalone Ethereum primary key without linked metadata', async () => {
    const keyring = (auth as unknown as { keyringService: { getAccount: (address: string) => unknown } }).keyringService;
    keyring.getAccount = (address) => address === evm ? { address: evm, meta: { name: 'Legacy Ethereum' } } : undefined;
    const dapp = outcome(auth.authorizeUrl(first, { origin: 'Public origin', accountAuthType: 'evm' }));
    await tick();
    const request = Object.values(auth.authRequests)[0];
    await request.resolve({ authorizedAccounts: [evm] });
    expect((await dapp).status).toBe('resolved');
    expect(storage.data[first]?.evmAuthorizedAccount).toBe(evm);
    auth = create();
    await auth.getAuthList();
    expect(auth.getEvmAuthorizationSnapshot(first).authorization?.evmAuthorizedAccount).toBe(evm);
  });

  it('blocks new authorization and signing snapshots during a wallet reset', async () => {
    await auth.setAuthorize({ [first]: grant() });
    const wallet = (auth as unknown as { keyringService: { isResetting: boolean; walletResetRevision: number } }).keyringService;
    wallet.isResetting = true;
    wallet.walletResetRevision = 1;
    const request = outcome(auth.authorizeUrl(second, { origin: 'Public site', accountAuthType: 'substrate' }));
    await tick();
    const queued = auth.numAuthRequests;
    // Clean up the pre-fix queued promise too, so the baseline failure is bounded.
    Object.values(auth.authRequests).forEach((entry) => entry.reject(new Error('Fixture cleanup')));
    expect((await request).status).toBe('rejected');
    expect(queued).toBe(0);
    expect(() => auth.getEvmAuthorizationSnapshot(first)).toThrow();
    expect(() => auth.getSigningAuthorizationSnapshot(first, 'substrate')).toThrow();
    expect(() => auth.getSigningAuthorizationSnapshot(first, 'solana')).toThrow();
  });
  it('physically clears stored grants when resetting before the first load', async () => {
    storage.data = { [first]: grant() };
    auth = create();
    await auth.resetWallet();
    expect(storage.data).toEqual({});
    auth = create();
    await auth.getAuthList();
    expectBlocked('substrate');
  });
  it.each(['deny', 'delete'] as const)(
    'retries a failed %s revocation even when its local veto is already applied',
    async (kind) => {
      storage.data = { [first]: grant() };
      auth = create();
      await auth.getAuthList();
      const revoke = () =>
        auth.mutateAuthorizations((entries) => {
          if (kind === 'delete') delete entries[first];
          else entries[first].isAllowed = false;
        });
      storage.writeError = true;
      expect((await outcome(revoke())).status).toBe('rejected');
      storage.writeError = false;
      await revoke();
      expect(storage.writes).toHaveLength(2);
      auth = create();
      await auth.getAuthList();
      expectBlocked('substrate');
    }
  );
  it('does not carry a failed grant into an already queued other-origin write', async () => {
    storage.delayWrites = true;
    const failed = outcome(
      auth.mutateAuthorizations((entries) => {
        entries[first] = grant();
      })
    );
    const independent = outcome(
      auth.mutateAuthorizations((entries) => {
        entries[second] = grant(second);
      })
    );
    await tick();
    storage.writeError = true;
    storage.writes[0]();
    expect((await failed).status).toBe('rejected');
    await tick();
    expect(storage.writes).toHaveLength(2);
    storage.writeError = false;
    storage.writes[1]();
    expect((await independent).status).toBe('resolved');
    expect(storage.data[first]).toBeUndefined();
    expectBlocked('substrate');
    expect(storage.data[second]?.isAllowed).toBe(true);
  });
  it('rejects a queued same-origin change assembled from a failed grant', async () => {
    storage.delayWrites = true;
    const failed = outcome(
      auth.mutateAuthorizations((entries) => {
        entries[first] = grant();
      })
    );
    const dependent = outcome(
      auth.mutateAuthorizations((entries) => {
        entries[first].currentEvmNetworkKey = 'Other';
      })
    );
    await tick();
    storage.writeError = true;
    storage.writes[0]();
    expect((await failed).status).toBe('rejected');
    expect((await dependent).status).toBe('rejected');
    expect(storage.writes).toHaveLength(1);
    expectBlocked('substrate');
    storage.writeError = false;
    storage.delayWrites = false;
    await auth.mutateAuthorizations((entries) => {
      entries[second] = grant(second);
    });
    expect(storage.data[first]).toBeUndefined();
  });
  it('never exposes a grant between a pending approval and its queued revocation', async () => {
    storage.delayWrites = true;
    const approved = outcome(
      auth.mutateAuthorizations((entries) => {
        entries[first] = grant();
      })
    );
    const revoked = outcome(
      auth.mutateAuthorizations((entries) => {
        delete entries[first];
      })
    );
    await tick();
    storage.writes[0]();
    await approved;
    await tick();
    expectBlocked('substrate');
    expect(storage.writes).toHaveLength(2);
    storage.writes[1]();
    expect((await revoked).status).toBe('resolved');
    expect(storage.data[first]).toBeUndefined();
  });
  it('retains a failed revocation during a later successful unrelated write and restart', async () => {
    storage.data = { [first]: grant() };
    auth = create();
    await auth.getAuthList();
    storage.writeError = true;
    await outcome(
      auth.mutateAuthorizations((entries) => {
        delete entries[first];
      })
    );
    storage.writeError = false;
    await auth.mutateAuthorizations((entries) => {
      entries[second] = grant(second);
    });
    auth = create();
    await auth.getAuthList();
    expectBlocked('substrate');
  });
  it.each([false, true])(
    'keeps failed popup approval pending for an explicit retry (existing grant: %s)',
    async (existing) => {
      if (existing) {
        storage.data = { [first]: grant() };
        auth = create();
        await auth.getAuthList();
      }
      const dapp = outcome(
        auth.authorizeUrl(first, { origin: 'Public origin', accountAuthType: 'substrate', reConfirm: true })
      );
      let finished = false;
      void dapp.then(() => {
        finished = true;
      });
      await tick();
      const request = Object.values(auth.authRequests)[0];
      storage.writeError = true;
      expect((await outcome(request.resolve({ authorizedAccounts: ['public-root'] }))).status).toBe('rejected');
      expect(finished).toBe(false);
      expect(auth.numAuthRequests).toBe(1);
      expectBlocked('substrate');
      storage.writeError = false;
      await request.resolve({ authorizedAccounts: ['public-root'] });
      expect((await dapp).status).toBe('resolved');
      expect(auth.numAuthRequests).toBe(0);
      auth = create();
      await auth.getAuthList();
      expect(auth.getSigningAuthorizationRevision(first, 'substrate', 'public-root')).toBeTypeOf('number');
    }
  );
  it('cancels an approval while persistence is pending without exposing the late grant', async () => {
    storage.delayWrites = true;
    const dapp = outcome(auth.authorizeUrl(first, { origin: 'Public origin', accountAuthType: 'substrate' }));
    await tick();
    const request = Object.values(auth.authRequests)[0];
    const action = outcome(request.resolve({ authorizedAccounts: ['public-root'] }));
    await tick();
    request.reject(new Error('Public cancellation'));
    expect((await dapp).status).toBe('rejected');
    expectBlocked('substrate');
    storage.writes[0]();
    expect((await action).status).toBe('rejected');
    await tick();
    expectBlocked('substrate');
    storage.writes[1]();
    await tick();
    expect(storage.data[first]).toBeUndefined();
  });
  it('does not acknowledge duplicate approval while its first write is pending', async () => {
    storage.delayWrites = true;
    const dapp = auth.authorizeUrl(first, { origin: 'Public origin', accountAuthType: 'substrate' });
    await tick();
    const request = Object.values(auth.authRequests)[0];
    const action = request.resolve({ authorizedAccounts: ['public-root'] });
    await tick();
    await expect(request.resolve({ authorizedAccounts: ['public-root'] })).rejects.toThrow('already');
    expect(storage.writes).toHaveLength(1);
    storage.writes[0]();
    await action;
    await dapp;
  });
  it('persists reset after an in-flight grant and does not revive that grant', async () => {
    storage.delayWrites = true;
    const approved = outcome(
      auth.mutateAuthorizations((entries) => {
        entries[first] = grant();
      })
    );
    await tick();
    const reset = auth.resetWallet();
    storage.writes[0]();
    await approved;
    await tick();
    expectBlocked('substrate');
    storage.writes[1]();
    await reset;
    auth = create();
    await auth.getAuthList();
    expectBlocked('substrate');
  });
  it.each(['evm', 'substrate', 'solana'] as const)(
    'does not activate a new %s grant while persistence is pending',
    async (protocol) => {
      storage.delayWrites = true;
      let done = false;
      const pending = outcome(
        auth.mutateAuthorizations((entries) => {
          entries[first] = grant();
        })
      ).then((result) => {
        done = true;
        return result;
      });
      await tick();
      expect(storage.writes).toHaveLength(1);
      expect(done).toBe(false);
      expectBlocked(protocol);
      storage.writes[0]();
      expect((await pending).status).toBe('resolved');
      expect(auth.getEvmAuthorizationSnapshot(first).authorization?.isAllowed).toBe(true);
    }
  );
  it.each(['evm', 'substrate', 'solana'] as const)(
    'rejects a failed %s grant write and keeps signing blocked',
    async (protocol) => {
      storage.writeError = true;
      const result = await outcome(
        auth.mutateAuthorizations((entries) => {
          entries[first] = grant();
        })
      );
      expect(result.status).toBe('rejected');
      expectBlocked(protocol);
      expect(storage.data[first]).toBeUndefined();
    }
  );
  it('applies a revocation veto immediately but only reports success after durable commit', async () => {
    storage.data = { [first]: grant() };
    auth = create();
    await auth.getAuthList();
    storage.delayWrites = true;
    let done = false;
    const pending = outcome(
      auth.mutateAuthorizations((entries) => {
        entries[first].isAllowed = false;
      })
    ).then((result) => {
      done = true;
      return result;
    });
    await tick();
    expectBlocked('substrate');
    expect(done).toBe(false);
    storage.writes[0]();
    expect((await pending).status).toBe('resolved');
    expect(storage.data[first].isAllowed).toBe(false);
  });
  it('surfaces failed revocation without restoring in-memory permission', async () => {
    storage.data = { [first]: grant() };
    auth = create();
    await auth.getAuthList();
    storage.writeError = true;
    expect(
      (
        await outcome(
          auth.mutateAuthorizations((entries) => {
            entries[first].isAllowed = false;
          })
        )
      ).status
    ).toBe('rejected');
    expectBlocked('substrate');
    // A failed physical write cannot erase the old durable record. It must not be
    // reported as a successful revocation or silently authorize in this process.
    expect(storage.data[first].isAllowed).toBe(true);
  });
  it('does not activate a failed new grant through a later unrelated write', async () => {
    storage.writeError = true;
    await outcome(
      auth.mutateAuthorizations((entries) => {
        entries[first] = grant();
      })
    );
    storage.writeError = false;
    await auth.mutateAuthorizations((entries) => {
      entries[second] = grant(second);
    });
    expectBlocked('substrate');
    expect(storage.data[first]?.isAllowed).not.toBe(true);
  });
  it('retries an explicitly renewed grant after storage recovers', async () => {
    storage.writeError = true;
    await outcome(
      auth.mutateAuthorizations((entries) => {
        entries[first] = grant();
      })
    );
    storage.writeError = false;
    await auth.mutateAuthorizations((entries) => {
      entries[first] = { ...grant(), id: 'explicit-retry' };
    });
    expect(auth.getEvmAuthorizationSnapshot(first).authorization?.id).toBe('explicit-retry');
    expect(storage.data[first].id).toBe('explicit-retry');
  });
  it('does not resolve a dapp authorization until the grant has committed', async () => {
    storage.delayWrites = true;
    let approved = false;
    const dapp = auth.authorizeUrl(first, { origin: 'Public origin', accountAuthType: 'substrate' }).then(() => {
      approved = true;
    });
    await tick();
    const request = Object.values(auth.authRequests)[0];
    const action = Promise.resolve(request.resolve({ authorizedAccounts: ['public-root'] }));
    await tick();
    expect(approved).toBe(false);
    expect(storage.data[first]).toBeUndefined();
    storage.writes[0]();
    await action;
    await dapp;
    expect(approved).toBe(true);
  });
  it('rejects a failed initial read instead of leaving the request pending forever', async () => {
    storage.readError = true;
    auth = create();
    const result = await Promise.race([
      outcome(auth.getAuthList()),
      new Promise<{ status: string }>((resolve) => setTimeout(() => resolve({ status: 'timeout' }), 100)),
    ]);
    expect(result.status).toBe('rejected');
    expect(() => auth.getEvmAuthorizationSnapshot(first)).toThrow();
  });
  it('can retry a failed initial read after storage recovers', async () => {
    storage.readError = true;
    auth = create();
    await Promise.race([outcome(auth.getAuthList()), new Promise((resolve) => setTimeout(resolve, 100))]);
    storage.readError = false;
    storage.data = { [first]: grant() };
    const result = await Promise.race([
      outcome(auth.getAuthList()),
      new Promise<{ status: string }>((resolve) => setTimeout(() => resolve({ status: 'timeout' }), 100)),
    ]);
    expect(result.status).toBe('resolved');
  });
});
