import { flushPromises, shallowMount } from '@vue/test-utils';

const mocks = vi.hoisted(() => ({
  checkCrossChain: vi.fn(),
  checkScamAddress: vi.fn(async () => ({ info: null, value: false })),
  checkTransfer: vi.fn(),
  accountsStore: {
    accounts: [],
    acountsEcosystem: [],
    balances: [
      {
        balances: [
          {
            existentialDeposit: '0',
            icon: 'iroha',
            id: 'xor',
            isUtility: true,
            name: 'Taira',
            precision: 18,
            transferable: '100',
          },
        ],
        priceId: 'xor',
        relayChain: 'iroha',
        symbol: 'XOR',
      },
    ],
    fiatSymbol: '$',
    selectedNetwork: 'Taira',
    selectedWallet: { address: 'stored-account', name: 'Test wallet' },
  },
  irohaNetwork: {
    active: true,
    assets: [{ id: 'xor' }],
    chainId: 'fc56984b-2be7-431d-840e-21514d1883f0',
    ecosystem: 'iroha',
    favorite: [],
    icon: 'iroha',
    key: 'Taira',
    name: 'Taira',
  },
}));

vi.mock('@/extension/messaging', () => ({
  checkCrossChain: mocks.checkCrossChain,
  checkScamAddress: mocks.checkScamAddress,
  checkTransfer: mocks.checkTransfer,
}));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => mocks.accountsStore }));
vi.mock('@/stores/networks', () => ({
  useNetworksStore: () => ({
    assetsPrice: { tokenPriceMap: {} },
    getAssetPrice: () => ({ price: 1 }),
    getNetwork: () => mocks.irohaNetwork,
    networks: [mocks.irohaNetwork],
  }),
}));
vi.mock('@/util/BaseApi', () => ({
  default: {
    formatAddress: ({ address }: { address: string }) => address,
    isBitcoinNetwork: () => false,
    isSameAddress: () => false,
    validateAddress: () => true,
    validateAddressByNetwork: () => true,
  },
}));
vi.mock('@/util/releaseFeatures', () => ({ isNetworkTransferEnabled: () => true }));
vi.mock('@extension-base/background/handlers/utils', () => ({
  getNativeAssetName: (value?: string) => value ?? '',
  getSubstrateEvmAssetName: (value: string) => value,
}));
vi.mock('@/helpers/currencies', () => ({
  calcTransferableSendMinusFee: () => 0,
  getCurrencyOptions: () => [],
  getUtilityAsset: () => ({ balances: mocks.accountsStore.balances[0].balances, symbol: 'XOR' }),
  isValidAmountAsset: () => true,
}));
vi.mock('@/helpers/transfers', () => ({
  getCostOfAssets: () => 1,
  getTransactionAddress: () => 'iroha-source',
  getTransferWalletRecipient: () => '',
  isTransferWalletRecipient: () => false,
}));

import TransferForm from '@/screens/wallet&asset/TransferForm.vue';

describe('transfer form fee failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkTransfer.mockResolvedValue({
      destEstimateFee: '0',
      errors: [{ code: 1, message: 'iroha_transfer_protocol_mismatch' }],
      estimateFee: '0',
    });
  });

  it('shows the dedicated Iroha compatibility error without rendering a zero fee', async () => {
    const wrapper = shallowMount(TransferForm, {
      props: {
        amount: '1',
        assetId: 'xor',
        extrinsicType: 'transfer',
        partialFee: '0',
        recipient: 'iroha-destination',
        selectedNetwork: 'Taira',
        value: '1',
      },
      global: {
        mocks: {
          $n: (value: number) => String(value),
          $t: (key: string) => key,
        },
        stubs: {
          AboveForm: { template: '<main><slot /></main>' },
          Alert: { template: '<div />' },
          BadgeButton: { template: '<button />' },
          FButton: {
            props: ['disabled', 'text'],
            template: '<button data-testid="continueBtn" :disabled="disabled">{{ text }}</button>',
          },
          FInput: { template: '<input />' },
          InfoRow: { props: ['value'], template: '<div data-testid="networkFeeRow">{{ value }}</div>' },
          InputWithIcon: { template: '<button />' },
          Scroll: { template: '<div><slot /></div>' },
          SelectInput: { template: '<div />' },
          Tooltip: { template: '<div />' },
        },
      },
    });

    await flushPromises();

    expect(mocks.checkTransfer).toHaveBeenCalledOnce();
    expect(wrapper.find('[data-testid="networkFeeRow"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="continueBtn"]').attributes()).toHaveProperty('disabled');
    expect(wrapper.get('[data-testid="continueBtn"]').text()).toBe('assets.irohaProtocolTestOnly');
    expect(wrapper.emitted('update:partialFee')?.at(-1)).toEqual(['']);
  });
});
