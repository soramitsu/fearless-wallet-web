import { describe, expect, it, vi } from 'vitest';
import { SoraApiHandler } from '@extension-base/services/network-service/handlers/SoraApiHandler';

const mocks = vi.hoisted(() => ({
  open: vi.fn(), api: undefined as undefined | { isReadyOrError: Promise<void> },
}));
vi.mock('@sora-substrate/util', () => ({
  api: {}, FPNumber: {}, connection: { open: mocks.open, get api() { return mocks.api; } },
}));

describe('offline SORA connection startup', () => {
  it('contains failed connection and readiness promises and permits the next endpoint attempt', async () => {
    mocks.open.mockImplementationOnce(() => {
      mocks.api = { isReadyOrError: Promise.reject(new Error('first endpoint offline')) };
      return Promise.reject(new Error('open failed'));
    }).mockImplementationOnce(() => {
      mocks.api = { isReadyOrError: Promise.resolve() };
      return Promise.resolve();
    });
    SoraApiHandler.initApi('wss://first.invalid', []);
    await new Promise((resolve) => setTimeout(resolve, 0));
    SoraApiHandler.initApi('wss://second.invalid', []);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.open).toHaveBeenCalledTimes(2);
    await expect(SoraApiHandler.getApiInstance().isReadyOrError).resolves.toBeUndefined();
  });
});
