import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionCapabilityService, resolveActionCapabilities, type ActionCapabilityConfig } from '@extension-base/services/action-capability-service';
import { SendKillSwitchService } from '@extension-base/services/send-kill-switch-service';
import { REMOTE_CONFIG_TIMEOUT_MS } from '@/util/remoteConfig';
import { emptySendKillSwitchState, type SendKillSwitchState } from '@/util/sendKillSwitch';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));

// Background start-up waits for both services (State.init) before it connects any network. A configuration host
// that accepts the connection and never answers must not hold that up for longer than the registry timeout.
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(axios.get).mockReturnValue(new Promise(() => undefined));
  process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS = 'true';
  process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS = 'true';
});
afterEach(() => {
  vi.useRealTimers();
  vi.mocked(axios.get).mockReset();
});

async function settlesAtTimeout(init: Promise<unknown>) {
  let settled = false;
  void init.then(() => {
    settled = true;
  });

  await vi.advanceTimersByTimeAsync(REMOTE_CONFIG_TIMEOUT_MS - 1);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(settled).toBe(true);
}

describe('a stalled remote configuration host', () => {
  it('releases action capabilities after the timeout and keeps the remembered configuration', async () => {
    const now = Date.now();
    const remembered = resolveActionCapabilities({ actions: { polkaswap: false } }, now);
    let stored: unknown = remembered;
    const service = new ActionCapabilityService({
      read: async () => stored,
      write: async (config: ActionCapabilityConfig) => {
        stored = config;
      },
    });

    await settlesAtTimeout(service.init());

    expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('web_config.json'), { timeout: REMOTE_CONFIG_TIMEOUT_MS });
    expect(service.isActionEnabled('polkaswap')).toBe(false);
    expect(stored).toBe(remembered);
  });

  it('releases the send kill switch after the timeout and keeps a remembered veto', async () => {
    const remembered: SendKillSwitchState = {
      ...emptySendKillSwitchState(),
      updatedAt: 1,
      vetoes: { ...emptySendKillSwitchState().vetoes, bitcoinSend: true },
    };
    const write = vi.fn(async () => undefined);
    const service = new SendKillSwitchService({ read: async () => remembered, write });

    await settlesAtTimeout(service.init());

    expect(write).not.toHaveBeenCalled();
    await expect(service.isSendEnabled('bitcoinSend')).resolves.toBe(false);
    await expect(service.isSendEnabled('solanaSend')).resolves.toBe(true);
  });
});
