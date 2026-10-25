import { describe, expect, it, vi } from 'vitest';
import { SoraApiHandler } from '@extension-base/services/network-service/handlers/SoraApiHandler';

const mocks = vi.hoisted(() => ({ apis: [] as { isReadyOrError: Promise<void>; disconnect: ReturnType<typeof vi.fn>; off: ReturnType<typeof vi.fn> }[] }));
vi.mock('@polkadot/api', () => ({
  WsProvider: class {},
  ApiPromise: class {
    disconnect = vi.fn().mockResolvedValue(undefined);
    off = vi.fn();
    on = vi.fn();
    isReadyOrError = mocks.apis.length ? Promise.resolve() : Promise.reject(new Error('first endpoint offline'));
    constructor() { mocks.apis.push(this); }
  },
}));

describe('offline SORA connection startup', () => {
  it('contains failed readiness and permits the next endpoint attempt', async () => {
    SoraApiHandler.initApi('wss://first.invalid', []);
    await new Promise((resolve) => setTimeout(resolve, 0));
    SoraApiHandler.initApi('wss://second.invalid', []);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.apis).toHaveLength(2);
    expect(mocks.apis[0].disconnect).toHaveBeenCalledOnce();
    await expect(SoraApiHandler.getApiInstance()!.isReadyOrError).resolves.toBeUndefined();
  });
});
