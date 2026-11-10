import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type { HistoryElement } from '@/interfaces';
import type { SelectedWallet } from '@/stores/accounts/types';
import english from '@/locales/en/translation.json';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';
import HistoryDetailsForm from '@/screens/wallet&asset/asset/HistoryDetailsForm.vue';
import HistoryItem from '@/screens/wallet&asset/asset/HistoryItem.vue';

vi.mock('@/extension/messaging', () => ({
  getHistory: vi.fn(),
  toggleFavoriteNetwork: vi.fn(),
}));

vi.mock('@/extension/messaging/price', () => ({
  getFiats: vi.fn(),
}));

// A universal wallet: its Substrate address is not its Solana address.
const SUBSTRATE_ADDRESS = '5GrwvaEF5zXb26Fz9rcQpDWSfNNbLDcb1RpsN4Hbh6q7G1j';
const WALLET = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const SOLANA = 'Solana';
const SIGNATURE = '5'.repeat(88);

const translate = (key: string) => {
  let value: unknown = english;

  for (const part of key.split('.')) {
    if (typeof value !== 'object' || value === null) return key;
    value = (value as Record<string, unknown>)[part];
  }

  return typeof value === 'string' ? value : key;
};

const mocks = {
  $n: (value: number) => value.toFixed(4),
  $route: { params: { selectedNetwork: SOLANA } },
  $t: translate,
};

// As the Solana indexer history builds it: the wallet's side of a balance change, the counterparty unknown.
function transfer(direction: 'incoming' | 'outgoing', address: string | undefined = WALLET): HistoryElement {
  const outgoing = direction === 'outgoing';

  return {
    address,
    blockHash: SIGNATURE,
    extrinsicHash: SIGNATURE,
    id: SIGNATURE,
    success: true,
    timestamp: '1782259200',
    transfer: { amount: '1500000000', fee: '5000', from: outgoing ? WALLET : '', to: outgoing ? '' : WALLET },
  } as unknown as HistoryElement;
}

function mountItem(historyElement: HistoryElement) {
  return mount(HistoryItem, {
    global: { mocks, stubs: { ExternalLogo: true } },
    props: { historyElement, network: SOLANA, token: { groupId: 'SOL', icon: 'sol', symbol: 'sol' } },
  });
}

function mountDetails(historyElement: HistoryElement) {
  return mount(HistoryDetailsForm, {
    global: {
      mocks,
      stubs: {
        AboveForm: { template: '<div><slot /></div>' },
        FButton: true,
        Icon: true,
        Identicon: true,
        Scroll: { template: '<div><slot /></div>' },
        Tooltip: true,
      },
    },
    props: { assetId: 'SOL', historyElement },
  });
}

describe('Solana history direction', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useNetworksStore().allNetworks = [
      {
        addressPrefix: 42,
        assets: [{ id: 'SOL', isUtility: true, precision: 9, symbol: 'SOL' }],
        chainId: 'solana:mainnet',
        ecosystem: 'solana',
        name: SOLANA,
      } as unknown as NetworkJson,
    ];
    useAccountsStore().balances = [
      {
        balances: [{ id: 'SOL', isUtility: true, name: SOLANA, precision: 9, symbol: 'SOL' }],
        groupId: 'SOL',
        symbol: 'SOL',
      } as unknown as TokenGroup,
    ];
    useAccountsStore().selectedWallet = {
      address: SUBSTRATE_ADDRESS,
      ethereumAddress: '0x0000000000000000000000000000000000000001',
      name: 'Universal',
      solanaAddress: WALLET,
    } as SelectedWallet;
  });

  it.each([
    ['history address', transfer('outgoing')],
    ['wallet Solana address', transfer('outgoing', undefined)],
  ])('shows the wallet own SOL send as outgoing using the %s', (_source, element) => {
    const wrapper = mountItem(element);

    expect(wrapper.get('[data-testid="valueHistory"]').text()).toBe('-1.5000 SOL');
    expect(wrapper.get('[data-testid="tModule"]').text()).toBe('Outgoing transfer');
    wrapper.unmount();
  });

  it('shows a SOL receipt as incoming', () => {
    const wrapper = mountItem(transfer('incoming'));

    expect(wrapper.get('[data-testid="valueHistory"]').text()).toBe('+1.5000 SOL');
    expect(wrapper.get('[data-testid="tModule"]').text()).toBe('Incoming transfer');
    wrapper.unmount();
  });

  it.each([
    ['outgoing', '-1.5000', true],
    ['incoming', '+1.5000', false],
  ] as const)('signs the %s SOL transfer in the details view and shows the fee only for a send', (direction, amount, fee) => {
    const wrapper = mountDetails(transfer(direction));

    expect(wrapper.get('[data-testid="amountValue"]').text()).toBe(amount);
    expect(wrapper.find('[data-testid="feeLabel"]').exists()).toBe(fee);
    wrapper.unmount();
  });
});
