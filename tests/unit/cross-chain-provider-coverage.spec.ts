import { mount } from '@vue/test-utils';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  accountsStore: {
    accounts: [],
    balances: [],
    selectedWallet: { address: '', name: 'Empty wallet' },
  },
  extensionStore: {
    features: {
      actions: {
        crossChainLiberland: false,
        crossChainSoraBridge: true,
        crossChainXcm: false,
      },
    } as
      | {
          actions?: Partial<
            Record<'crossChainLiberland' | 'crossChainSoraBridge' | 'crossChainXcm', boolean>
          >;
        }
      | undefined,
  },
  networksStore: { allNetworks: [] },
}));

vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/consts/global', () => ({ CONTENT_FORM_HEIGHT: 500 }));
vi.mock('@/router/routes', () => ({ Components: { CrossChainForm: 'CrossChainForm' } }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => mocks.accountsStore }));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => mocks.extensionStore }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => mocks.networksStore }));
vi.mock('@/locales/useI18n', () => {
  const messages: Record<string, string> = {
    'crossChainPage.title': 'Cross-chain',
    'crossChainPage.subtitle': 'Choose an origin first. Only reviewed routes are enabled.',
    'crossChainPage.originNetwork': 'Origin network',
    'crossChainPage.selectNetwork': 'Select network',
    'crossChainPage.providerCoverage': 'Provider coverage',
    'crossChainPage.coverageIndependent': 'Availability does not depend on the asset selected above.',
    'crossChainPage.otherEcosystems': 'Other ecosystems are unavailable.',
    'crossChainPage.providerStatus.reviewed': 'Reviewed',
    'crossChainPage.providerStatus.disabled': 'Disabled',
    'crossChainPage.providerStatus.unavailable': 'Unavailable',
    'crossChainPage.providerReason.noClaimRecovery':
      'No reviewed executable claim and recovery flow is bundled.',
    'crossChainPage.providerReason.noExecutableRoute': 'No reviewed executable route is bundled.',
    'crossChainPage.providerReason.policyDisabled':
      'Reviewed route authority is bundled, but transfers are not enabled by the current capability policy.',
  };

  return {
    useI18n: () => ({
      t: (key: string) => messages[key] ?? key,
      tc: (_key: string, count: number) => `${count} reviewed route available`,
    }),
  };
});

import CrossChainRoot from '@/screens/cross-chain/CrossChainRoot.vue';

describe('cross-chain provider coverage', () => {
  beforeEach(() => {
    mocks.extensionStore.features = {
      actions: {
        crossChainLiberland: false,
        crossChainSoraBridge: true,
        crossChainXcm: false,
      },
    };
  });

  it('renders the complete provider inventory before a wallet owns an asset', () => {
    const wrapper = mount(CrossChainRoot, {
      global: {
        stubs: {
          ContentForm: { props: ['height'], template: '<main><slot /></main>' },
          FButton: { template: '<button />' },
          Icon: { template: '<span />' },
          Scroll: { template: '<div><slot /></div>' },
        },
      },
    });

    expect(mocks.accountsStore.balances).toEqual([]);
    expect(mocks.networksStore.allNetworks).toEqual([]);
    expect(wrapper.get('[data-testid="crossChainProviderCoverage"]')).toBeTruthy();
    expect(wrapper.findAll('.provider-row')).toHaveLength(4);
    expect(wrapper.findAll('select')[0].findAll('option')).toHaveLength(1);

    expect(wrapper.get('[data-testid="crossChainProvider-wallet-xcm"]').text()).toMatch(
      /Wallet XCM.*Disabled.*not enabled by the current capability policy/s
    );
    expect(wrapper.get('[data-testid="crossChainProvider-sora-substrate-bridge"]').text()).toMatch(
      /SORA ↔ Substrate.*Reviewed.*reviewed route/s
    );
    expect(wrapper.get('[data-testid="crossChainProvider-sora-evm-bridge"]').text()).toMatch(
      /SORA ↔ Ethereum.*Unavailable.*claim and recovery flow/s
    );
    expect(wrapper.get('[data-testid="crossChainProvider-liberland-bridge"]').text()).toMatch(
      /SORA ↔ Liberland.*Disabled.*not enabled by the current capability policy/s
    );
  });

  it('fails closed without claiming a release-policy pause while capabilities are unloaded', () => {
    mocks.extensionStore.features = undefined;
    const wrapper = mount(CrossChainRoot, {
      global: {
        stubs: {
          ContentForm: { props: ['height'], template: '<main><slot /></main>' },
          FButton: { template: '<button />' },
          Icon: { template: '<span />' },
          Scroll: { template: '<div><slot /></div>' },
        },
      },
    });

    const policyControlledRows = wrapper.findAll('.provider-row').filter((row) => !row.text().includes('Ethereum'));

    expect(policyControlledRows).toHaveLength(3);
    policyControlledRows.forEach((row) => {
      expect(row.text()).toContain('Disabled');
      expect(row.text()).toContain('not enabled by the current capability policy');
      expect(row.text()).not.toMatch(/Paused|temporarily disabled by release policy/);
    });
  });
});
