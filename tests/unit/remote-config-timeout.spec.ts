import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionCapabilityService, resolveActionCapabilities, type ActionCapabilityConfig } from '@extension-base/services/action-capability-service';
import { SendKillSwitchService } from '@extension-base/services/send-kill-switch-service';
import { DappSigningKillSwitchService } from '@extension-base/services/dapp-signing-kill-switch-service';
import { REMOTE_CONFIG_TIMEOUT_MS, fetchRemoteFeatureConfig } from '@/util/remoteConfig';
import { emptySendKillSwitchState, type SendKillSwitchState } from '@/util/sendKillSwitch';
import { emptyDappSigningKillSwitchState, type DappSigningKillSwitchState } from '@/util/dappSigningKillSwitch';

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

  it('releases the dApp signing kill switch after the timeout, keeping a remembered pause, with one request for all three', async () => {
    const remembered: DappSigningKillSwitchState = {
      ...emptyDappSigningKillSwitchState(),
      updatedAt: 1,
      vetoes: { ...emptyDappSigningKillSwitchState().vetoes, evm: true },
    };
    const write = vi.fn(async () => undefined);
    const dappSigning = new DappSigningKillSwitchService({ read: async () => remembered, write });
    const send = new SendKillSwitchService({ read: async () => undefined, write: vi.fn(async () => undefined) });
    const actions = new ActionCapabilityService({ read: async () => undefined, write: async () => undefined });

    await settlesAtTimeout(Promise.all([dappSigning.init(), send.init(), actions.init()]));

    // The worker's start-up readers share one request to the configuration host.
    expect(axios.get).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
    await expect(dappSigning.isSigningAllowed('evm')).resolves.toBe(false);
    await expect(dappSigning.isSigningAllowed('polkadot')).resolves.toBe(true);
  });
});

describe('remote configuration requests', () => {
  it('shares a request only while it is under way', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { actions: { solanaSend: false } } });

    const [first, second] = await Promise.all([fetchRemoteFeatureConfig(), fetchRemoteFeatureConfig()]);
    expect(first).toEqual({ actions: { solanaSend: false } });
    expect(second).toBe(first);
    expect(axios.get).toHaveBeenCalledOnce();

    await fetchRemoteFeatureConfig();
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  it('lets the next caller retry after a failed request', async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: {} });

    await expect(fetchRemoteFeatureConfig()).rejects.toThrow('offline');
    await expect(fetchRemoteFeatureConfig()).resolves.toEqual({});
    expect(axios.get).toHaveBeenCalledTimes(2);
  });
});
