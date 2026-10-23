import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SendKillSwitchService,
  assertSendCapability,
} from '@extension-base/services/send-kill-switch-service';
import {
  applyRemoteSendFlags,
  emptySendKillSwitchState,
  normalizeSendKillSwitchState,
  readRemoteSendFlags,
  type SendKillSwitchState,
} from '@/util/sendKillSwitch';

const FLAG = 'VUE_APP_ENABLE_SOLANA_TRANSFERS';
const originalFlag = process.env[FLAG];

const memoryStorage = (initial?: unknown) => {
  let stored = initial as SendKillSwitchState | undefined;

  return {
    read: vi.fn(async () => stored),
    write: vi.fn(async (state: SendKillSwitchState) => {
      stored = state;
    }),
    get stored() {
      return stored;
    },
  };
};

const vetoed = (vetoes: Partial<SendKillSwitchState['vetoes']>): SendKillSwitchState => ({
  ...emptySendKillSwitchState(),
  updatedAt: 1,
  vetoes: { ...emptySendKillSwitchState().vetoes, ...vetoes },
});

beforeEach(() => {
  delete process.env[FLAG];
});

afterEach(() => {
  if (originalFlag === undefined) delete process.env[FLAG];
  else process.env[FLAG] = originalFlag;
});

describe('remote send flags', () => {
  it.each([
    [{ fiat: { moonpay: true } }, {}],
    [{ actions: { solanaSend: false } }, { solanaSend: false }],
    [{ actions: { solanaSend: true } }, { solanaSend: true }],
    [{ feature_toggle: { solana_send_enabled: false } }, { solanaSend: false }],
    [{ actionCapabilities: { solanaSend: 'false' } }, {}],
    // The Bitcoin send is not part of this kill switch: a Bitcoin key changes nothing.
    [{ actions: { bitcoinSend: false } }, {}],
    [{ actions: null }, {}],
    [{ actions: [false] }, {}],
    [null, {}],
    ['not json', {}],
  ])('reads only explicit Solana booleans from %j', (raw, expected) => {
    expect(readRemoteSendFlags(raw)).toEqual(expected);
  });

  it('treats a veto in any section as a veto', () => {
    expect(
      readRemoteSendFlags({ actions: { solanaSend: true }, feature_toggle: { solana_send_enabled: false } })
    ).toEqual({ solanaSend: false });
  });
});

describe('sticky veto-only state', () => {
  it('keeps the compiled default when nothing is remembered and the key is absent', () => {
    expect(applyRemoteSendFlags(undefined, { fiat: {} }, 3)).toEqual({
      schemaVersion: 1,
      updatedAt: 3,
      vetoes: { solanaSend: false },
    });
  });

  it('remembers an explicit false and keeps it while the key is later absent', () => {
    const first = applyRemoteSendFlags(undefined, { actions: { solanaSend: false } }, 1);
    const second = applyRemoteSendFlags(first, { actions: {} }, 2);

    expect(first.vetoes).toEqual({ solanaSend: true });
    expect(second.vetoes).toEqual({ solanaSend: true });
  });

  it('lifts a remembered veto only on an explicit true', () => {
    const lifted = applyRemoteSendFlags(vetoed({ solanaSend: true }), { actions: { solanaSend: true } }, 9);

    expect(lifted.vetoes.solanaSend).toBe(false);
  });

  it('reads an unreadable remembered state as no veto', () => {
    for (const value of [undefined, null, 'x', { schemaVersion: 2, vetoes: { solanaSend: true } }, { schemaVersion: 1 }]) {
      expect(normalizeSendKillSwitchState(value)).toEqual(emptySendKillSwitchState());
    }

    expect(normalizeSendKillSwitchState(vetoed({ solanaSend: true })).vetoes.solanaSend).toBe(true);
  });
});

describe('SendKillSwitchService', () => {
  it('ships the Solana send enabled when the remote config is absent', async () => {
    const storage = memoryStorage();
    const service = new SendKillSwitchService(storage, async () => ({ fiat: { moonpay: true } }));

    await service.init();

    await expect(service.isSendEnabled('solanaSend')).resolves.toBe(true);
  });

  it('applies and remembers a remote veto', async () => {
    const storage = memoryStorage();
    const service = new SendKillSwitchService(storage, async () => ({ actions: { solanaSend: false } }));

    await service.init();

    await expect(service.isSendEnabled('solanaSend')).resolves.toBe(false);
    await expect(service.assertSendEnabled('solanaSend')).rejects.toThrow('solana_transfer_disabled');
    expect(storage.stored?.vetoes.solanaSend).toBe(true);
  });

  it('keeps a remembered veto across a failed fetch', async () => {
    const storage = memoryStorage(vetoed({ solanaSend: true }));
    const service = new SendKillSwitchService(storage, async () => {
      throw new Error('offline');
    });

    await service.init();

    await expect(service.assertSendEnabled('solanaSend')).rejects.toThrow('solana_transfer_disabled');
    expect(storage.write).not.toHaveBeenCalled();
  });

  it('keeps a remembered veto when a successful fetch omits the key', async () => {
    const storage = memoryStorage(vetoed({ solanaSend: true }));
    const service = new SendKillSwitchService(storage, async () => ({ actions: { polkaswap: true } }));

    await service.init();

    await expect(service.isSendEnabled('solanaSend')).resolves.toBe(false);
  });

  it('applies a fetched veto even when remembering it fails', async () => {
    const storage = memoryStorage();
    storage.write.mockRejectedValueOnce(new Error('quota'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = new SendKillSwitchService(storage, async () => ({ actions: { solanaSend: false } }));

    await service.init();

    await expect(service.isSendEnabled('solanaSend')).resolves.toBe(false);
    warn.mockRestore();
  });

  it('honours a remembered veto for a send that arrives before the remote fetch finishes', async () => {
    const storage = memoryStorage(vetoed({ solanaSend: true }));
    let release: (value: unknown) => void = () => undefined;
    const service = new SendKillSwitchService(storage, () => new Promise((resolve) => (release = resolve)));
    const initializing = service.init();

    await expect(service.isSendEnabled('solanaSend')).resolves.toBe(false);

    release({ actions: { solanaSend: true } });
    await initializing;

    await expect(service.isSendEnabled('solanaSend')).resolves.toBe(true);
  });

  it('never enables a send that the build compiled off', async () => {
    process.env[FLAG] = 'false';
    const service = new SendKillSwitchService(memoryStorage(), async () => ({ actions: { solanaSend: true } }));

    await service.init();

    await expect(service.isSendEnabled('solanaSend')).resolves.toBe(false);
    await expect(assertSendCapability({ sendKillSwitchService: service }, 'solanaSend')).rejects.toThrow(
      'solana_transfer_disabled'
    );
    await expect(assertSendCapability({}, 'solanaSend')).rejects.toThrow('solana_transfer_disabled');
  });

  it('lets a state double without the service honour the compiled-on flag', async () => {
    await expect(assertSendCapability({}, 'solanaSend')).resolves.toBeUndefined();
  });
});
