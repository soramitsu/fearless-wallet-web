vi.mock('@/extension/messaging', () => ({ upsertNetworkMap: vi.fn() }));

import EditNodeForm from '@/screens/accounts/EditNodeForm.vue';
import { upsertNetworkMap } from '@/extension/messaging';

type FormMethod = (this: Record<string, unknown>) => unknown;
const component = EditNodeForm as unknown as { methods: Record<string, FormMethod> };

const hasError = (url: string, networkJson: Record<string, unknown>): unknown => {
  const form: Record<string, unknown> = {
    isError: false,
    isUrlDuplicate: false,
    networkJson,
    nodeUrl: '',
    url,
    urlLength: url.length,
  };

  component.methods.isErrorUrlNode.call(form);

  return form.isError;
};

const solana = { ecosystem: 'solana', externalApi: undefined };

describe('Adding a custom node', () => {
  it.each([
    'https://mainnet.helius-rpc.com/?api-key=0123456789',
    'https://solana-mainnet.example/0123456789abcdef',
    'http://localhost:8899',
    'http://127.0.0.1:8899',
  ])('accepts %s for Solana', (url) => {
    expect(hasError(url, solana)).toBe(false);
  });

  it.each([
    ['a websocket address, which Solana JSON-RPC does not use', 'wss://solana.example'],
    ['plain http to a remote host', 'http://solana.example'],
    ['credentials in the address, which a browser will not send', 'https://user:secret@solana.example'],
    ['an address without a scheme', 'solana.example/rpc'],
    ['an address too short to be one', 'https:/'],
  ])('refuses %s for Solana', (_label, url) => {
    expect(hasError(url, solana)).toBe(true);
  });

  it('keeps the rules of the other networks', () => {
    const substrate = { ecosystem: 'substrate', externalApi: undefined };
    const etherscan = { ecosystem: 'evm', externalApi: { explorers: [{ type: 'etherscan' }] } };

    expect(hasError('wss://rpc.example', substrate)).toBe(false);
    expect(hasError('https://rpc.example', substrate)).toBe(true);
    expect(hasError('https://api.example', etherscan)).toBe(false);
    expect(hasError('wss://api.example', etherscan)).toBe(true);
  });

  it('saves a new Solana node and selects it', () => {
    const emit = vi.fn();
    const networkJson = { customNodes: [{ name: 'OLD', url: 'https://old.example/rpc' }], ecosystem: 'solana', key: 'Solana' };
    const form: Record<string, unknown> = {
      $emit: emit,
      name: 'KEYED',
      networkJson,
      nodeName: '',
      nodeUrl: '',
      url: 'https://mainnet.helius-rpc.com/?api-key=0123456789',
      urlLength: 52,
    };

    component.methods.updateNodes.call(form);

    expect(upsertNetworkMap).toHaveBeenCalledWith(
      expect.objectContaining({
        currentProvider: 'https://mainnet.helius-rpc.com/?api-key=0123456789',
        customNodes: [
          { name: 'OLD', url: 'https://old.example/rpc' },
          { name: 'KEYED', url: 'https://mainnet.helius-rpc.com/?api-key=0123456789' },
        ],
      })
    );
    expect(emit).toHaveBeenCalledWith('closeForm', true);
  });

  it('flags a node the network already has before looking at its address', () => {
    const form: Record<string, unknown> = {
      isError: false,
      isUrlDuplicate: true,
      networkJson: solana,
      nodeUrl: '',
      url: 'https://solana.example/rpc',
      urlLength: 26,
    };

    component.methods.isErrorUrlNode.call(form);

    expect(form.isError).toBe(true);
  });
});
