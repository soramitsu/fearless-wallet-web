import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type { HistoryElement } from '@/interfaces';
import type { SelectedWallet } from '@/stores/accounts/types';
import { cut } from '@/helpers';
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

const fixture = JSON.parse(readFileSync(resolve(__dirname, '../../docs/universal-wallet-v2-vectors.json'), 'utf8')) as {
  vectors: Array<{ expected: { iroha: { taira: { i105: string; publicKeyHex: string } } } }>;
};

const WALLET = fixture.vectors[0].expected.iroha.taira.i105;
const WALLET_PUBLIC_KEY = fixture.vectors[0].expected.iroha.taira.publicKeyHex;
const COUNTERPARTY = fixture.vectors[1].expected.iroha.taira.i105;
const SUBSTRATE_ADDRESS = '5GrwvaEF5zXb26Fz9rcQpDWSfNNbLDcb1RpsN4Hbh6q7G1j';
const TAIRA = 'Taira Testnet';
const TAIRA_CHAIN_ID = 'fc56984b-2be7-431d-840e-21514d1883f0';
const TAIRA_XOR_ASSET_ID = '6TEAJqbb8oEPmLncoNiMRbLEK6tw';
const HASH = '11'.repeat(32);

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
  $route: { params: { selectedNetwork: TAIRA } },
  $t: translate,
};

function transfer(direction: 'incoming' | 'outgoing', address: string | undefined = WALLET): HistoryElement {
  const outgoing = direction === 'outgoing';

  return {
    address,
    blockHeight: 62,
    extrinsicHash: HASH,
    id: `${HASH}:${direction}:0`,
    success: true,
    timestamp: '1782259200',
    transfer: {
      amount: '1250000000',
      fee: null,
      from: outgoing ? WALLET : COUNTERPARTY,
      to: outgoing ? COUNTERPARTY : WALLET,
    },
  } as unknown as HistoryElement;
}

function mountItem(historyElement: HistoryElement) {
  return mount(HistoryItem, {
    global: { mocks, stubs: { ExternalLogo: true } },
    props: { historyElement, network: TAIRA, token: { groupId: TAIRA_XOR_ASSET_ID, icon: 'xor', symbol: 'xor' } },
  });
}

describe('Iroha history direction', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useNetworksStore().allNetworks = [
      {
        addressPrefix: 0,
        assets: [],
        chainId: TAIRA_CHAIN_ID,
        ecosystem: 'iroha',
        externalApi: { history: { type: 'iroha', url: 'https://taira.sora.org' } },
        name: TAIRA,
      } as unknown as NetworkJson,
    ];
    useAccountsStore().balances = [
      {
        balances: [{ id: TAIRA_XOR_ASSET_ID, name: TAIRA, precision: 9, symbol: 'XOR' }],
        groupId: TAIRA_XOR_ASSET_ID,
        symbol: 'XOR',
      } as unknown as TokenGroup,
    ];
    // The wallet's Substrate address must never stand in for its I105 account.
    useAccountsStore().selectedWallet = {
      address: SUBSTRATE_ADDRESS,
      ethereumAddress: '',
      irohaPublicKeyHex: WALLET_PUBLIC_KEY,
      name: 'Taira QA',
    } as SelectedWallet;
  });

  it.each([
    ['history address', transfer('outgoing')],
    ['wallet I105 address', transfer('outgoing', undefined)],
  ])('shows the wallet own Taira send as outgoing to the recipient using the %s', (_source, element) => {
    const wrapper = mountItem(element);

    expect(wrapper.get('[data-testid="valueHistory"]').text()).toBe('-1.2500 XOR');
    expect(wrapper.get('[data-testid="tModule"]').text()).toBe('Outgoing transfer');
    expect(wrapper.get('[data-testid="hash"]').text()).toBe(cut(COUNTERPARTY));
    wrapper.unmount();
  });

  it('shows a Taira receipt as incoming from the sender', () => {
    const wrapper = mountItem(transfer('incoming'));

    expect(wrapper.get('[data-testid="valueHistory"]').text()).toBe('+1.2500 XOR');
    expect(wrapper.get('[data-testid="tModule"]').text()).toBe('Incoming transfer');
    expect(wrapper.get('[data-testid="hash"]').text()).toBe(cut(COUNTERPARTY));
    wrapper.unmount();
  });

  it.each([
    ['outgoing', '-1.2500'],
    ['incoming', '+1.2500'],
  ] as const)('signs the %s Taira transfer amount in the details view', (direction, amount) => {
    const wrapper = mount(HistoryDetailsForm, {
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
      props: { assetId: TAIRA_XOR_ASSET_ID, historyElement: transfer(direction) },
    });

    expect(wrapper.get('[data-testid="amountValue"]').text()).toBe(amount);
    expect(wrapper.find('[data-testid="feeLabel"]').exists()).toBe(false);
    // Torii movements carry only the block height, so no transaction hash is labelled a block hash.
    expect(wrapper.text()).toContain('Extrinsic hash');
    expect(wrapper.text()).not.toContain('Block hash');
    wrapper.unmount();
  });
});
