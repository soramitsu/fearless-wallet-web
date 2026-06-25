import { vi } from 'vitest';
import { SubstrateApiHandler } from '@extension-base/services/network-service/handlers/SubstrateApiHandler';
import { decryptForCosigner, encryptByCosigner } from '@extension-base/page';
import { NATIVE_ETHEREUM_NETWORKS } from '@/consts/networks';
import type { NetworkJson } from '@extension-base/types';

const dwellirNetwork = (): NetworkJson =>
  ({
    currentProvider: 'wss://manual.dwellir.example',
    isManual: false,
    name: 'Dwellir Test',
    nodes: [{ name: 'default', url: 'wss://provider.dwellir.example' }],
  }) as unknown as NetworkJson;

describe('MST release compatibility contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.FL_WEB_DWELLIR_API_KEY;
    delete process.env.FL_DWELLIR_API_KEY;
  });

  it('keeps the 3.0.5 native EVM network labels available', () => {
    expect(NATIVE_ETHEREUM_NETWORKS).toEqual(
      expect.arrayContaining([
        'x layer testnet',
        'x layer mainnet',
        'manta pacific mainnet',
        'oasys mainnet',
        'rootstock mainnet',
        'latest mainnet',
        'caga ankara testnet',
        'zchains',
        'inevm testnet',
      ])
    );
  });

  it('uses the renamed Dwellir environment variable and keeps the old name as a fallback', () => {
    const handler = new SubstrateApiHandler({} as never, {} as never);

    process.env.FL_WEB_DWELLIR_API_KEY = 'new-key';
    expect(handler.getListeners(dwellirNetwork()).currentProvider).toBe('wss://provider.dwellir.example/new-key');

    delete process.env.FL_WEB_DWELLIR_API_KEY;
    process.env.FL_DWELLIR_API_KEY = 'old-key';
    expect(handler.getListeners(dwellirNetwork()).currentProvider).toBe('wss://provider.dwellir.example/old-key');
  });

  it('exposes authorized page messages for MST cosigner crypto requests', () => {
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);

    void decryptForCosigner({
      address: '5GrwvaEF5zXb26Fz9rcQpDWSf1EqL9v1JNwmrjFh5J3Qj4o',
      data: {} as never,
      encryptorPublicKey: new Uint8Array([1, 2, 3]),
    });
    void encryptByCosigner({
      address: '5GrwvaEF5zXb26Fz9rcQpDWSf1EqL9v1JNwmrjFh5J3Qj4o',
      cosigners: { alice: '0x010203' },
      data: 'payload',
    });

    expect(postMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ message: 'pub(decrypt.cosigner)' }),
      '*'
    );
    expect(postMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ message: 'pub(encrypt.cosigner)' }),
      '*'
    );
  });
});
