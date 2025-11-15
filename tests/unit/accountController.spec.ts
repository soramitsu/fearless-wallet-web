import { accountController } from '@/controllers';
import type { NetworkName } from '@/interfaces';
import type { Node } from '@/interfaces/nodes';

describe('accountController storage safeguards', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('deduplicates hidden warning networks', () => {
    const network = 'polkadot' as NetworkName;

    accountController.setHiddenWarningNetwork(network);
    accountController.setHiddenWarningNetwork(network);

    expect(accountController.getHiddenWarningNetworks()).toEqual([network]);
  });

  it('sanitizes custom nodes retrieved from storage', () => {
    const validNode: Node = { name: 'Fearless RPC', url: 'wss://fearless.network' };

    localStorage.setItem(
      'account_custom-nodes',
      JSON.stringify({
        value: {
          sora: [validNode, { name: 123 }, { url: null }, 'invalid'],
        },
      })
    );

    expect(accountController.getCustomNodes()).toEqual({ sora: [validNode] });
  });

  it('sanitizes hidden assets payloads', () => {
    localStorage.setItem(
      'account_hidden-assets',
      JSON.stringify({
        value: {
          '5D4': ['asset-1', 123, null],
          invalid: 'not-an-array',
        },
      })
    );

    expect(accountController.getHiddenAssets()).toEqual({ '5D4': ['asset-1'] });
  });

  it('drops invalid sequence assets', () => {
    localStorage.setItem(
      'account_sequence-assets',
      JSON.stringify({
        value: {
          valid: 'asset-2,asset-3',
          invalid: ['wrong'],
        },
      })
    );

    expect(accountController.getSequenceAssetsByAddress('valid')).toEqual(['asset-2', 'asset-3']);
    expect(accountController.getSequenceAssetsByAddress('invalid')).toEqual([]);
  });

  it('sanitizes auto-select node map', () => {
    localStorage.setItem(
      'account_auto-select-nodes',
      JSON.stringify({
        value: {
          polkadot: true,
          kusama: 'yes',
        },
      })
    );

    expect(accountController.getAutoSelectNodesValue()).toEqual({ polkadot: true });
  });

  it('sanitizes active nodes map', () => {
    localStorage.setItem(
      'account_active-node',
      JSON.stringify({
        value: {
          polkadot: { name: 'Parity', url: 'wss://rpc.polkadot.io' },
          kusama: { name: 123, url: null },
        },
      })
    );

    expect(accountController.getActiveNodes()).toEqual({
      polkadot: { name: 'Parity', url: 'wss://rpc.polkadot.io' },
    });
  });
});
