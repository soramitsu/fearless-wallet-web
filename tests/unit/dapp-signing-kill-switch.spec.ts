import axios from 'axios';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('@/extension/messaging', () => ({}));
vi.mock('@/router', () => ({ default: { push: vi.fn() } }));
vi.mock('@/router/routes', () => ({ Components: {} }));

import {
  DappSigningKillSwitchService,
  isDappSigningAllowed,
} from '@extension-base/services/dapp-signing-kill-switch-service';
import {
  DAPP_SIGNING_FAMILIES,
  DAPP_SIGNING_PAUSED,
  DappSigningPausedError,
  applyRemoteDappSigningFlags,
  dappSigningFamilyOfQueue,
  emptyDappSigningKillSwitchState,
  isDappSigningPaused,
  normalizeDappSigningKillSwitchState,
  pausedDappSigningFamily,
  readRemoteDappSigningFlags,
  type DappSigningFamily,
  type DappSigningKillSwitchState,
} from '@/util/dappSigningKillSwitch';
import { applyRemoteSendFlags, readRemoteSendFlags } from '@/util/sendKillSwitch';
import { useExtensionStore } from '@/stores/extension';
import { useDappSigningKillSwitchStore } from '@/stores/dappSigningKillSwitch';

const STORAGE_KEY = 'feature_dapp-signing-kill-switch-v1';
const MOBILE_KEYS: Readonly<Record<DappSigningFamily, string>> = {
  polkadot: 'polkadot_dapp_signing_enabled',
  evm: 'evm_dapp_signing_enabled',
  solana: 'solana_dapp_signing_enabled',
  ton: 'ton_dapp_signing_enabled',
};
const WEB_KEYS: Readonly<Record<DappSigningFamily, string>> = {
  polkadot: 'polkadotDappSigning',
  evm: 'evmDappSigning',
  solana: 'solanaDappSigning',
  ton: 'tonDappSigning',
};

const memoryStorage = (initial?: unknown) => {
  let stored = initial as DappSigningKillSwitchState | undefined;

  return {
    read: vi.fn(async () => stored),
    write: vi.fn(async (state: DappSigningKillSwitchState) => {
      stored = state;
    }),
    get stored() {
      return stored;
    },
  };
};

const paused = (vetoes: Partial<DappSigningKillSwitchState['vetoes']>): DappSigningKillSwitchState => ({
  ...emptyDappSigningKillSwitchState(),
  updatedAt: 1,
  vetoes: { ...emptyDappSigningKillSwitchState().vetoes, ...vetoes },
});

const otherFamilies = (family: DappSigningFamily) => DAPP_SIGNING_FAMILIES.filter((other) => other !== family);

describe('remote dApp signing flags', () => {
  it.each(DAPP_SIGNING_FAMILIES)('reads the mobile and web_config names for %s', (family) => {
    expect(readRemoteDappSigningFlags({ feature_toggle: { [MOBILE_KEYS[family]]: false } })).toEqual({ [family]: false });
    expect(readRemoteDappSigningFlags({ actions: { [WEB_KEYS[family]]: false } })).toEqual({ [family]: false });
    expect(readRemoteDappSigningFlags({ actionCapabilities: { [WEB_KEYS[family]]: true } })).toEqual({ [family]: true });
  });

  it.each([
    [{ fiat: { moonpay: true } }],
    [{ actions: { evmDappSigning: 'false' } }],
    [{ feature_toggle: { evm_dapp_signing_enabled: 0 } }],
    [{ feature_toggle: { polkadot_dapp_signing_enabled: null } }],
    [{ actions: null }],
    [{ actions: [false] }],
    [null],
    ['not json'],
  ])('ignores anything but an explicit boolean in %j', (raw) => {
    expect(readRemoteDappSigningFlags(raw)).toEqual({});
  });

  it('never reads the legacy dapp_enabled key, which production already holds as false', () => {
    const raw = { feature_toggle: { dapp_enabled: false }, actions: { dapp_enabled: false, dappEnabled: false } };

    expect(readRemoteDappSigningFlags(raw)).toEqual({});
    expect(applyRemoteDappSigningFlags(undefined, raw, 1).vetoes).toEqual(emptyDappSigningKillSwitchState().vetoes);
  });

  it('treats a pause in any section as a pause', () => {
    expect(
      readRemoteDappSigningFlags({ actions: { evmDappSigning: true }, feature_toggle: { evm_dapp_signing_enabled: false } })
    ).toEqual({ evm: false });
  });

  it('is independent of the send switches that share the payload', () => {
    const raw = { actions: { solanaSend: false }, feature_toggle: { solana_dapp_signing_enabled: true } };

    expect(readRemoteDappSigningFlags(raw)).toEqual({ solana: true });
    expect(readRemoteSendFlags(raw)).toEqual({ solanaSend: false });
  });
});

describe('sticky veto-only dApp signing state', () => {
  it('allows every family when nothing is remembered and no key is published', () => {
    expect(applyRemoteDappSigningFlags(undefined, { fiat: {} }, 3)).toEqual({
      schemaVersion: 1,
      updatedAt: 3,
      vetoes: { polkadot: false, evm: false, solana: false, ton: false },
    });
  });

  it('remembers an explicit false and keeps it while the key is later absent or malformed', () => {
    const first = applyRemoteDappSigningFlags(undefined, { feature_toggle: { evm_dapp_signing_enabled: false } }, 1);
    const absent = applyRemoteDappSigningFlags(first, { feature_toggle: {} }, 2);
    const malformed = applyRemoteDappSigningFlags(absent, { feature_toggle: { evm_dapp_signing_enabled: 'true' } }, 3);

    for (const state of [first, absent, malformed]) {
      expect(state.vetoes).toEqual({ polkadot: false, evm: true, solana: false, ton: false });
    }
  });

  it('lifts a remembered pause only on an explicit true', () => {
    const lifted = applyRemoteDappSigningFlags(paused({ ton: true, polkadot: true }), { actions: { tonDappSigning: true } }, 9);

    expect(lifted.vetoes).toEqual({ polkadot: true, evm: false, solana: false, ton: false });
  });

  it('reads an unreadable remembered state as no pause', () => {
    for (const value of [undefined, null, 'x', { schemaVersion: 2, vetoes: { evm: true } }, { schemaVersion: 1 }]) {
      expect(normalizeDappSigningKillSwitchState(value)).toEqual(emptyDappSigningKillSwitchState());
    }

    expect(normalizeDappSigningKillSwitchState(paused({ solana: true })).vetoes.solana).toBe(true);
    expect(normalizeDappSigningKillSwitchState({ schemaVersion: 1, updatedAt: 'x', vetoes: { evm: 'yes' } })).toEqual(
      emptyDappSigningKillSwitchState()
    );
  });

  // The send switch and this one share remoteVeto.ts; the same payload sequence moves both the same way.
  it('follows the send kill switch rule step by step', () => {
    const steps: { send?: Record<string, unknown>; dapp?: Record<string, unknown> }[] = [
      { send: { bitcoinSend: false }, dapp: { polkadotDappSigning: false } },
      {},
      { send: { bitcoinSend: 'false' }, dapp: { polkadotDappSigning: 'false' } },
      { send: { bitcoinSend: true }, dapp: { polkadotDappSigning: true } },
    ];
    let send = applyRemoteSendFlags(undefined, {}, 0);
    let dapp = applyRemoteDappSigningFlags(undefined, {}, 0);

    for (const step of steps) {
      send = applyRemoteSendFlags(send, { actions: step.send ?? {} }, 1);
      dapp = applyRemoteDappSigningFlags(dapp, { actions: step.dapp ?? {} }, 1);
      expect(dapp.vetoes.polkadot).toBe(send.vetoes.bitcoinSend);
    }
  });
});

describe('DappSigningKillSwitchService', () => {
  it.each(DAPP_SIGNING_FAMILIES)('allows %s when the remote config says nothing', async (family) => {
    const service = new DappSigningKillSwitchService(memoryStorage(), async () => ({ fiat: { moonpay: true } }));

    await service.init();

    await expect(service.isSigningAllowed(family)).resolves.toBe(true);
  });

  it.each(DAPP_SIGNING_FAMILIES)('pauses and remembers %s on false, leaving the other families alone', async (family) => {
    const storage = memoryStorage();
    const service = new DappSigningKillSwitchService(storage, async () => ({
      feature_toggle: { [MOBILE_KEYS[family]]: false },
    }));

    await service.init();

    await expect(service.isSigningAllowed(family)).resolves.toBe(false);
    for (const other of otherFamilies(family)) await expect(service.isSigningAllowed(other)).resolves.toBe(true);
    expect(storage.stored?.vetoes[family]).toBe(true);
  });

  it('keeps a remembered pause across a failed fetch', async () => {
    const storage = memoryStorage(paused({ evm: true }));
    const service = new DappSigningKillSwitchService(storage, async () => {
      throw new Error('offline');
    });

    await service.init();

    await expect(service.isSigningAllowed('evm')).resolves.toBe(false);
    await expect(service.isSigningAllowed('polkadot')).resolves.toBe(true);
    expect(storage.write).not.toHaveBeenCalled();
  });

  it('keeps a remembered pause when a successful fetch omits the key', async () => {
    const storage = memoryStorage(paused({ polkadot: true }));
    const service = new DappSigningKillSwitchService(storage, async () => ({ actions: { polkaswap: true } }));

    await service.init();

    await expect(service.isSigningAllowed('polkadot')).resolves.toBe(false);
  });

  it('applies a fetched pause even when remembering it fails', async () => {
    const storage = memoryStorage();
    storage.write.mockRejectedValueOnce(new Error('quota'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = new DappSigningKillSwitchService(storage, async () => ({ actions: { solanaDappSigning: false } }));

    await service.init();

    await expect(service.isSigningAllowed('solana')).resolves.toBe(false);
    warn.mockRestore();
  });

  it('reads an unreadable store as no pause', async () => {
    const service = new DappSigningKillSwitchService(
      { read: vi.fn(async () => Promise.reject(new Error('storage'))), write: vi.fn(async () => undefined) },
      async () => {
        throw new Error('offline');
      }
    );

    await service.init();

    await expect(service.isSigningAllowed('evm')).resolves.toBe(true);
    expect(service.snapshot).toEqual(emptyDappSigningKillSwitchState());
  });

  it('honours a remembered pause for an approval that arrives before the remote fetch finishes', async () => {
    const storage = memoryStorage(paused({ evm: true }));
    let release: (value: unknown) => void = () => undefined;
    const service = new DappSigningKillSwitchService(storage, () => new Promise((resolve) => (release = resolve)));
    const initializing = service.init();

    await expect(service.isSigningAllowed('evm')).resolves.toBe(false);

    release({ feature_toggle: { evm_dapp_signing_enabled: true } });
    await initializing;

    await expect(service.isSigningAllowed('evm')).resolves.toBe(true);
  });

  it('allows signing for a State double that does not model the switch', async () => {
    await expect(isDappSigningAllowed({}, 'evm')).resolves.toBe(true);
    const service = new DappSigningKillSwitchService(memoryStorage(paused({ ton: true })), async () => ({}));
    await expect(isDappSigningAllowed({ dappSigningKillSwitchService: service }, 'ton')).resolves.toBe(false);
    await expect(isDappSigningAllowed({ dappSigningKillSwitchService: service }, 'evm')).resolves.toBe(true);
  });
});

describe('refusal reasons', () => {
  it('names the paused family in a message that survives the message port', () => {
    const error = new DappSigningPausedError('solana');

    expect(error.message).toBe(`${DAPP_SIGNING_PAUSED}:solana`);
    expect(pausedDappSigningFamily(new Error(error.message))).toBe('solana');
    expect(pausedDappSigningFamily(new Error(`${DAPP_SIGNING_PAUSED}:bitcoin`))).toBeUndefined();
    expect(pausedDappSigningFamily(new Error('Cancelled'))).toBeUndefined();
    expect(pausedDappSigningFamily('dapp_signing_paused:evm')).toBeUndefined();
  });

  it('maps each signing queue to its family', () => {
    expect(dappSigningFamilyOfQueue('substrate')).toBe('polkadot');
    expect(dappSigningFamilyOfQueue('evm')).toBe('evm');
    expect(dappSigningFamilyOfQueue('solana')).toBe('solana');
    expect(isDappSigningPaused('evm', { evm: true })).toBe(true);
    expect(isDappSigningPaused('evm', undefined)).toBe(false);
  });
});

const createLocalStorageStub = () => {
  const storage = new Map<string, string>();

  return {
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    removeItem: (key: string) => storage.delete(key),
    setItem: (key: string, value: string) => storage.set(key, value),
    get length() {
      return storage.size;
    },
  };
};

describe('popup dApp signing kill switch', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageStub());
    setActivePinia(createPinia());
    vi.mocked(axios.get).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pauses nothing when the remote config says nothing', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: { fiat: { moonpay: true }, feature_toggle: { dapp_enabled: false } } });

    await useExtensionStore().fetchFeatures();

    expect(useDappSigningKillSwitchStore().vetoes).toEqual({ polkadot: false, evm: false, solana: false, ton: false });
  });

  it('pauses a family and keeps the pause across an offline start', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: { feature_toggle: { evm_dapp_signing_enabled: false } } });

    await useExtensionStore().fetchFeatures();

    expect(isDappSigningPaused('evm', useDappSigningKillSwitchStore().vetoes)).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).value.vetoes.evm).toBe(true);

    setActivePinia(createPinia());
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('offline'));

    await useExtensionStore().fetchFeatures();

    expect(isDappSigningPaused('evm', useDappSigningKillSwitchStore().vetoes)).toBe(true);
    expect(isDappSigningPaused('polkadot', useDappSigningKillSwitchStore().vetoes)).toBe(false);
  });

  it('lifts a pause only on an explicit true', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ value: { schemaVersion: 1, updatedAt: 1, vetoes: { polkadot: true, evm: false, solana: false, ton: false } } })
    );
    vi.mocked(axios.get).mockResolvedValueOnce({ data: { actions: {} } });
    const store = useExtensionStore();

    await store.fetchFeatures();
    expect(useDappSigningKillSwitchStore().vetoes.polkadot).toBe(true);

    vi.mocked(axios.get).mockResolvedValueOnce({ data: { actions: { polkadotDappSigning: true } } });
    await store.fetchFeatures();
    expect(useDappSigningKillSwitchStore().vetoes.polkadot).toBe(false);
  });

  it('treats an unreadable remembered state as no pause', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('offline'));

    await useExtensionStore().fetchFeatures();

    expect(useDappSigningKillSwitchStore().vetoes).toEqual(emptyDappSigningKillSwitchState().vetoes);
  });
});
