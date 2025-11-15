import type { PoolXykModuleCtor, SoraUtilModule } from '@/extension/background/extension-base/src/services/utils/sora';

const createSoraModule = async () => {
  jest.resetModules();

  const soraMock = {
    api: {
      rpc: {},
    },
    connection: { provider: 'ws' },
  };

  jest.doMock('@sora', () => soraMock, { virtual: true });

  class PoolXykMock {
    constructor(public api: unknown) {}
  }

  jest.doMock('@sora/poolXyk', () => ({ PoolXykModule: PoolXykMock }), { virtual: true });

  const module = await import('@/extension/background/extension-base/src/services/utils/sora');

  return {
    module,
    soraMock,
    PoolXykMock,
  };
};

describe('sora utils loader', () => {
  it('loads and caches the Sora util module with patched poolXyk', async () => {
    const { module, soraMock, PoolXykMock } = await createSoraModule();
    const loadSora: jest.Mock<Promise<SoraUtilModule>, []> = jest.fn(async () => soraMock as unknown as SoraUtilModule);
    const loadPool: jest.Mock<Promise<PoolXykModuleCtor>, []> = jest.fn(
      async () => PoolXykMock as unknown as PoolXykModuleCtor
    );

    module.__setSoraLoadersForTesting({
      loadSora: loadSora as unknown as () => Promise<SoraUtilModule>,
      loadPoolXyk: loadPool as unknown as () => Promise<PoolXykModuleCtor>,
      resetState: true,
    });

    const util = await module.getSoraUtil();
    expect(loadSora).toHaveBeenCalledTimes(1);
    expect(loadPool).toHaveBeenCalledTimes(1);
    expect(util).toBe(soraMock);
    expect(util.api.poolXyk).toBeInstanceOf(PoolXykMock);

    const cached = module.getSoraUtilOrThrow();
    expect(cached).toBe(util);
    expect(module.getCachedSoraUtil()).toBe(util);

    await module.getSoraUtil();
    expect(loadSora).toHaveBeenCalledTimes(1);
  });

  it('resets loader after a failing import so retries can succeed', async () => {
    const { module, soraMock, PoolXykMock } = await createSoraModule();

    const loadError = new Error('network down');
    const loadSora: jest.Mock<Promise<SoraUtilModule>, []> = jest
      .fn()
      .mockRejectedValueOnce(loadError)
      .mockResolvedValueOnce(soraMock as unknown as SoraUtilModule);

    const loadPool: jest.Mock<Promise<PoolXykModuleCtor>, []> = jest.fn(
      async () => PoolXykMock as unknown as PoolXykModuleCtor
    );

    module.__setSoraLoadersForTesting({
      loadSora: loadSora as unknown as () => Promise<SoraUtilModule>,
      loadPoolXyk: loadPool as unknown as () => Promise<PoolXykModuleCtor>,
      resetState: true,
    });

    await expect(module.getSoraUtil()).rejects.toThrow('network down');
    expect(loadSora).toHaveBeenCalledTimes(1);

    const util = await module.getSoraUtil();
    expect(loadSora).toHaveBeenCalledTimes(2);
    expect(util).toBe(soraMock);
  });

  it('recovers when pool module fails to load', async () => {
    const { module, soraMock, PoolXykMock } = await createSoraModule();

    const poolError = new Error('pool loader fail');
    const loadPool: jest.Mock<Promise<PoolXykModuleCtor>, []> = jest
      .fn()
      .mockRejectedValueOnce(poolError as unknown as PoolXykModuleCtor)
      .mockResolvedValueOnce(PoolXykMock as unknown as PoolXykModuleCtor);

    const loadSora: jest.Mock<Promise<SoraUtilModule>, []> = jest.fn(async () => soraMock as unknown as SoraUtilModule);

    module.__setSoraLoadersForTesting({
      loadSora: loadSora as unknown as () => Promise<SoraUtilModule>,
      loadPoolXyk: loadPool as unknown as () => Promise<PoolXykModuleCtor>,
      resetState: true,
    });

    await expect(module.getSoraUtil()).rejects.toThrow(poolError);
    expect(loadPool).toHaveBeenCalledTimes(1);

    const util = await module.getSoraUtil();
    expect(loadPool).toHaveBeenCalledTimes(2);
    expect(util.api.poolXyk).toBeInstanceOf(PoolXykMock);
  });

  it('getSoraUtilOrThrow guards access prior to initialization', async () => {
    const { module, soraMock, PoolXykMock } = await createSoraModule();
    const loadSora: jest.Mock<Promise<SoraUtilModule>, []> = jest.fn(async () => soraMock as unknown as SoraUtilModule);
    const loadPool: jest.Mock<Promise<PoolXykModuleCtor>, []> = jest.fn(
      async () => PoolXykMock as unknown as PoolXykModuleCtor
    );

    module.__setSoraLoadersForTesting({
      loadSora: loadSora as unknown as () => Promise<SoraUtilModule>,
      loadPoolXyk: loadPool as unknown as () => Promise<PoolXykModuleCtor>,
      resetState: true,
    });

    expect(() => module.getSoraUtilOrThrow()).toThrow('Sora utilities accessed before initialization');

    await module.getSoraUtil();

    expect(() => module.getSoraUtilOrThrow()).not.toThrow();
  });
});
