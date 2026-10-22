import axios from 'axios';
import { describe, expect, it, vi } from 'vitest';
import {
  ActionCapabilityService,
  failClosedActionCapabilities,
  parseActionCapabilityConfig,
} from '@extension-base/services/action-capability-service';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));

describe('ActionCapabilityService', () => {
  it('fails closed for absent mutation and discovery rollout fields', () => {
    expect(parseActionCapabilityConfig({ fiat: { moonpay: true } }, 1)).toEqual({
      ...failClosedActionCapabilities(),
      updatedAt: 1,
    });
  });

  it('keeps a persisted snapshot when the remote source is unavailable', async () => {
    const cached = parseActionCapabilityConfig(
      { actions: { demeter: true }, assetDiscoveryMode: 'visible' },
      5
    );
    const write = vi.fn();
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('offline'));
    const service = new ActionCapabilityService({ read: async () => cached, write });

    await expect(service.init()).resolves.toEqual(cached);
    expect(service.isActionEnabled('demeter')).toBe(true);
    expect(service.shouldSurfaceDiscoveredAssets()).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });
});
