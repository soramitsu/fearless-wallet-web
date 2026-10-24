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

const FLAGS = ['VUE_APP_ENABLE_BITCOIN_TRANSFERS', 'VUE_APP_ENABLE_SOLANA_TRANSFERS'] as const;
const originalFlags = Object.fromEntries(FLAGS.map((flag) => [flag, process.env[flag]]));

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
  process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS = 'true';
  process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS = 'true';
});

afterEach(() => {
  FLAGS.forEach((flag) => {
    if (originalFlags[flag] === undefined) delete process.env[flag];
    else process.env[flag] = originalFlags[flag];
  });
});

describe('remote send flags', () => {
  it.each([
    [{ fiat: { moonpay: true } }, {}],
    [{ actions: { bitcoinSend: false } }, { bitcoinSend: false }],
    [{ actions: { solanaSend: true } }, { solanaSend: true }],
    [{ feature_toggle: { bitcoin_send_enabled: false, solana_send_enabled: false } }, { bitcoinSend: false, solanaSend: false }],
    [{ actionCapabilities: { bitcoinSend: 'false' } }, {}],
    [{ actions: null }, {}],
    [{ actions: [false] }, {}],
    [null, {}],
    ['not json', {}],
  ])('reads only explicit booleans from %j', (raw, expected) => {
    expect(readRemoteSendFlags(raw)).toEqual(expected);
  });

  it('treats a veto in any section as a veto', () => {
    expect(
      readRemoteSendFlags({ actions: { bitcoinSend: true }, feature_toggle: { bitcoin_send_enabled: false } })
    ).toEqual({ bitcoinSend: false });
  });
});

describe('sticky veto-only state', () => {
  it('keeps the compiled default when nothing is remembered and the key is absent', () => {
    expect(applyRemoteSendFlags(undefined, { fiat: {} }, 3)).toEqual({
      schemaVersion: 1,
      updatedAt: 3,
      vetoes: { bitcoinSend: false, solanaSend: false },
    });
  });

  it('remembers an explicit false and keeps it while the key is later absent', () => {
    const first = applyRemoteSendFlags(undefined, { actions: { bitcoinSend: false } }, 1);
    const second = applyRemoteSendFlags(first, { actions: {} }, 2);

    expect(first.vetoes).toEqual({ bitcoinSend: true, solanaSend: false });
    expect(second.vetoes).toEqual({ bitcoinSend: true, solanaSend: false });
  });

  it('lifts a remembered veto only on an explicit true', () => {
    const lifted = applyRemoteSendFlags(vetoed({ solanaSend: true }), { actions: { solanaSend: true } }, 9);

    expect(lifted.vetoes.solanaSend).toBe(false);
  });

  it('reads an unreadable remembered state as no veto', () => {
    for (const value of [undefined, null, 'x', { schemaVersion: 2, vetoes: { bitcoinSend: true } }, { schemaVersion: 1 }]) {
      expect(normalizeSendKillSwitchState(value)).toEqual(emptySendKillSwitchState());
    }

    expect(normalizeSendKillSwitchState(vetoed({ bitcoinSend: true })).vetoes.bitcoinSend).toBe(true);
  });
});

describe('SendKillSwitchService', () => {
  it('ships both sends enabled when the remote config is absent', async () => {
    const storage = memoryStorage();
    const service = new SendKillSwitchService(storage, async () => ({ fiat: { moonpay: true } }));

    await service.init();

    await expect(service.isSendEnabled('bitcoinSend')).resolves.toBe(true);
    await expect(service.isSendEnabled('solanaSend')).resolves.toBe(true);
  });

  it('applies and remembers a remote veto', async () => {
    const storage = memoryStorage();
    const service = new SendKillSwitchService(storage, async () => ({ actions: { bitcoinSend: false } }));

    await service.init();

    await expect(service.isSendEnabled('bitcoinSend')).resolves.toBe(false);
    await expect(service.assertSendEnabled('bitcoinSend')).rejects.toThrow('bitcoin_transfer_disabled');
    await expect(service.isSendEnabled('solanaSend')).resolves.toBe(true);
    expect(storage.stored?.vetoes.bitcoinSend).toBe(true);
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
    const storage = memoryStorage(vetoed({ bitcoinSend: true }));
    const service = new SendKillSwitchService(storage, async () => ({ actions: { polkaswap: true } }));

    await service.init();

    await expect(service.isSendEnabled('bitcoinSend')).resolves.toBe(false);
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
    const storage = memoryStorage(vetoed({ bitcoinSend: true }));
    let release: (value: unknown) => void = () => undefined;
    const service = new SendKillSwitchService(storage, () => new Promise((resolve) => (release = resolve)));
    const initializing = service.init();

    await expect(service.isSendEnabled('bitcoinSend')).resolves.toBe(false);

    release({ actions: { bitcoinSend: true } });
    await initializing;

    await expect(service.isSendEnabled('bitcoinSend')).resolves.toBe(true);
  });

  it('never enables a send that the build compiled off', async () => {
    process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS = 'false';
    const service = new SendKillSwitchService(memoryStorage(), async () => ({ actions: { solanaSend: true } }));

    await service.init();

    await expect(service.isSendEnabled('solanaSend')).resolves.toBe(false);
    await expect(assertSendCapability({ sendKillSwitchService: service }, 'solanaSend')).rejects.toThrow(
      'solana_transfer_disabled'
    );
    await expect(assertSendCapability({}, 'solanaSend')).rejects.toThrow('solana_transfer_disabled');
    await expect(assertSendCapability({}, 'bitcoinSend')).resolves.toBeUndefined();
  });
});
