import { computed, defineComponent, h, type PropType } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { APIItemState } from '@extension-base/api/types/networks';
import { RELEASE_DEFAULT_ACTIONS } from '@extension-base/services/action-capability-service';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { createAssetKey } from '@/portfolio/assetIdentity';
import { createReviewedCrossChainRouteId } from '@/cross-chain/reviewedRoutes';

const POLKADOT = '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3';
const POLKADOT_ASSET_HUB = '68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f';
const DOT = '887a17c7-1370-4de0-97dd-5422e294fa75';
const XCM_DOT = '99e66d4f-00cd-4d73-bd1b-3adadcacffb2';
const DOT_KEY = createAssetKey({ ecosystem: 'substrate', chainId: POLKADOT, assetId: DOT });
const DOT_TO_ASSET_HUB = createReviewedCrossChainRouteId({
  providerId: 'wallet-xcm',
  originChainId: POLKADOT,
  destinationChainId: POLKADOT_ASSET_HUB,
  originAssetId: DOT,
});

const messages: Record<string, string> = {
  'crossChainPage.pausedTitle': 'Transfers between networks are paused',
  'crossChainPage.pausedBody': 'This version keeps cross-network transfers off while each route is re-verified.',
  'crossChainPage.sendOnNetwork': 'Send on {network}',
  'crossChainPage.chooseRoute': 'Choose a route',
  'crossChainPage.route.disabled': 'Choose another destination.',
  'common.back': 'Back',
};
const translate = (key: string, params: Record<string, unknown> = {}): string =>
  (messages[key] ?? key).replace(/\{(\w+)\}/g, (_match, name: string) => String(params[name] ?? ''));

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  accountsStore: {
    accounts: [] as unknown[],
    balances: [] as unknown[],
    selectedWallet: { address: '', name: 'Wallet' },
  },
  extensionStore: { features: undefined as { actions: Record<string, boolean> } | undefined },
  networksStore: {
    allNetworks: [] as unknown[],
    getNetwork(name: string) {
      return (this.allNetworks as Array<{ name: string }>).find((network) => network.name === name);
    },
  },
}));

vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/consts/global', () => ({ CONTENT_FORM_HEIGHT: 500, IS_PRODUCTION: false }));
vi.mock('@/router/routes', () => ({
  Components: {
    CrossChain: 'CrossChain',
    CrossChainForm: 'CrossChainForm',
    ReceiveForm: 'ReceiveForm',
    SendForm: 'SendForm',
    SoraSwap: 'SoraSwap',
    Wallet: 'Wallet',
  },
}));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => mocks.accountsStore }));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => mocks.extensionStore }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => mocks.networksStore }));
vi.mock('@/screens/wallet&asset/TransferForm.vue', () => ({
  default: { name: 'TransferForm', template: '<div class="transfer-form"><slot name="step1Warning" /></div>' },
}));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({ t: translate, tc: translate }),
}));

import AssetActionButtons from '@/screens/wallet&asset/asset/AssetActionButtons.vue';
import CrossChainRoot from '@/screens/cross-chain/CrossChainRoot.vue';
import CrossChainForm from '@/screens/wallet&asset/CrossChainForm.vue';

const FButton = defineComponent({
  props: {
    text: {
      type: [String, Object] as PropType<string | { text: string; localeProps?: Record<string, unknown> }>,
      default: '',
    },
  },
  emits: ['click'],
  setup(props, { attrs, emit }) {
    const label = computed(() =>
      typeof props.text === 'string' ? translate(props.text) : translate(props.text.text, props.text.localeProps)
    );

    return () => h('button', { ...attrs, type: 'button', onClick: () => emit('click') }, label.value);
  },
});

const stubs = {
  AboveForm: { template: '<section class="above-form"><slot /></section>' },
  Alert: { props: ['message'], template: '<p class="alert">{{ message }}</p>' },
  BorderButton: { emits: ['click'], template: '<button type="button" @click="$emit(\'click\')" />' },
  ContentForm: { props: ['height'], template: '<main><slot /></main>' },
  FButton,
  Icon: { template: '<span />' },
  Scroll: { template: '<div><slot /></div>' },
};

const registryAsset = (id: string, symbol: string, precision: number) => ({
  color: '#fff',
  icon: symbol.toLowerCase(),
  id,
  name: symbol,
  precision,
  providers: [],
  staking: '',
  symbol,
  type: 'normal',
});

const polkadot = {
  active: true,
  assets: [registryAsset(DOT, 'DOT', 10)],
  chainId: POLKADOT,
  ecosystem: 'substrate',
  icon: 'polkadot',
  name: 'Polkadot',
  options: [],
  xcm: {
    availableAssets: [{ id: XCM_DOT, interiors: [], symbol: 'DOT', versions: ['v3'] }],
    availableDestinations: [
      {
        assets: [{ id: XCM_DOT, interiors: [], symbol: 'DOT', versions: ['v3'] }],
        bridgeParachainId: '',
        chainId: POLKADOT_ASSET_HUB,
      },
    ],
    xcmVersion: 'v3',
  },
} as unknown as NetworkJson;

const assetHub = {
  active: true,
  assets: [registryAsset('asset-hub-dot', 'DOT', 10)],
  chainId: POLKADOT_ASSET_HUB,
  ecosystem: 'substrate',
  icon: 'asset-hub',
  name: 'Polkadot Asset Hub',
  options: [],
} as unknown as NetworkJson;

const dotGroup = (transferable = '10') =>
  ({
    balances: [
      { id: DOT, name: 'Polkadot', state: APIItemState.READY, symbol: 'DOT', total: transferable, transferable },
    ],
    groupId: 'dot',
    icon: 'dot',
    mainNetwork: 'Polkadot',
    providers: [],
    relayChain: 'polkadot',
    symbol: 'DOT',
    tokenName: 'Polkadot',
  }) as unknown as TokenGroup;

const mountRoot = (props: Record<string, string> = {}) => mount(CrossChainRoot, { props, global: { stubs } });

describe('cross-chain entry without dead ends', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.push.mockReset();
    mocks.back.mockReset();
    mocks.accountsStore.balances = [dotGroup()];
    mocks.accountsStore.accounts = [];
    mocks.networksStore.allNetworks = [polkadot, assetHub];
    mocks.extensionStore.features = { actions: { ...RELEASE_DEFAULT_ACTIONS } };
  });

  describe('asset page', () => {
    const mountButtons = (assetId: string) =>
      mount(AssetActionButtons, {
        props: { currency: dotGroup(), assetId },
        global: {
          stubs,
          mocks: {
            $route: { params: { assetId, selectedNetwork: 'Polkadot' } },
            $router: { push: mocks.push },
          },
        },
      });

    it.each([DOT, 'dot'])('opens the route builder with this network and asset (%s)', (assetId) => {
      (mountButtons(assetId).vm as unknown as { onRoute: (form: string) => void }).onRoute('crossChain');

      expect(mocks.push).toHaveBeenCalledWith({
        name: 'CrossChain',
        query: { originChainId: POLKADOT, assetKey: DOT_KEY },
      });
    });

    it('passes only the network when the wallet holds none of the asset there', () => {
      mocks.accountsStore.balances = [dotGroup('0')];

      (mountButtons(DOT).vm as unknown as { onRoute: (form: string) => void }).onRoute('crossChain');

      expect(mocks.push).toHaveBeenCalledWith({ name: 'CrossChain', query: { originChainId: POLKADOT } });
    });

    it('keeps send on the transfer form', () => {
      (mountButtons(DOT).vm as unknown as { onRoute: (form: string) => void }).onRoute('send');

      expect(mocks.push).toHaveBeenCalledWith({ name: 'SendForm', params: { assetId: DOT, network: 'Polkadot' } });
    });
  });

  describe('route builder', () => {
    it('preselects a matching network and asset from the asset page', async () => {
      const wrapper = mountRoot({ requestedOriginChainId: POLKADOT, requestedAssetKey: DOT_KEY });
      await flushPromises();

      const [origin, asset] = wrapper.findAll('select');
      expect((origin.element as HTMLSelectElement).value).toBe(POLKADOT);
      expect((asset.element as HTMLSelectElement).value).toBe(DOT_KEY);
    });

    it('ignores a network the wallet holds nothing on', async () => {
      const wrapper = mountRoot({ requestedOriginChainId: POLKADOT_ASSET_HUB, requestedAssetKey: DOT_KEY });
      await flushPromises();

      const [origin, asset] = wrapper.findAll('select');
      expect((origin.element as HTMLSelectElement).value).toBe('');
      expect((asset.element as HTMLSelectElement).value).toBe('');
    });

    it('keeps a matching network but ignores an asset key that is not owned there', async () => {
      const wrapper = mountRoot({
        requestedOriginChainId: POLKADOT,
        requestedAssetKey: createAssetKey({ ecosystem: 'substrate', chainId: POLKADOT, assetId: 'other' }),
      });
      await flushPromises();

      const [origin, asset] = wrapper.findAll('select');
      expect((origin.element as HTMLSelectElement).value).toBe(POLKADOT);
      expect((asset.element as HTMLSelectElement).value).toBe('');
    });

    it('explains the pause and offers Send on the same network', async () => {
      const wrapper = mountRoot({ requestedOriginChainId: POLKADOT, requestedAssetKey: DOT_KEY });
      await flushPromises();

      const paused = wrapper.get('[data-testid="crossChainPaused"]');
      expect(paused.text()).toContain('Transfers between networks are paused');
      expect(paused.text()).toContain('re-verified');

      const send = wrapper.get('[data-testid="crossChainSendOnNetwork"]');
      expect(send.text()).toBe('Send on Polkadot');
      await send.trigger('click');

      expect(mocks.push).toHaveBeenCalledWith({ name: 'SendForm', params: { assetId: DOT, network: 'Polkadot' } });
    });

    it('explains the pause before an asset is chosen, without a send shortcut', () => {
      const wrapper = mountRoot();

      expect(wrapper.find('[data-testid="crossChainPaused"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="crossChainSendOnNetwork"]').exists()).toBe(false);
    });

    it('describes a paused reviewed route as paused, not as a reason to pick another destination', async () => {
      const wrapper = mountRoot({ requestedOriginChainId: POLKADOT, requestedAssetKey: DOT_KEY });
      await flushPromises();

      await wrapper.findAll('select')[2].setValue(DOT_TO_ASSET_HUB);

      expect(wrapper.get('.route-disabled').text()).toBe('Transfers between networks are paused');
    });

    it('shows no pause when the route capability is enabled', async () => {
      mocks.extensionStore.features = { actions: { ...RELEASE_DEFAULT_ACTIONS, crossChainXcm: true } };
      const wrapper = mountRoot({ requestedOriginChainId: POLKADOT, requestedAssetKey: DOT_KEY });
      await flushPromises();

      expect(wrapper.find('[data-testid="crossChainPaused"]').exists()).toBe(false);
    });

    it('claims no pause while capabilities are still loading', () => {
      mocks.extensionStore.features = undefined;

      expect(mountRoot().find('[data-testid="crossChainPaused"]').exists()).toBe(false);
    });
  });

  describe('transfer form', () => {
    const mountForm = (query: Record<string, string>) =>
      mount(CrossChainForm, {
        global: {
          stubs,
          mocks: {
            $route: { params: { assetId: DOT, network: 'Polkadot' }, query },
            $router: { push: mocks.push, back: mocks.back },
            $t: translate,
          },
        },
      });

    it('offers Choose a route next to Back when no route id is given', async () => {
      const wrapper = mountForm({});
      const buttons = wrapper.findAll('.above-form button');

      expect(buttons.map((button) => button.text())).toEqual(['Back', 'Choose a route']);

      await wrapper.get('[data-testid="chooseCrossChainRoute"]').trigger('click');
      expect(mocks.push).toHaveBeenCalledWith({ name: 'CrossChain' });

      await buttons[0].trigger('click');
      expect(mocks.back).toHaveBeenCalled();
    });

    it('shows the pause explanation for a reviewed route whose capability is off', () => {
      const wrapper = mountForm({ routeId: DOT_TO_ASSET_HUB });

      expect(wrapper.find('.transfer-form').exists()).toBe(true);
      expect(wrapper.get('.alert').text()).toBe('crossChainPage.pausedBody');
    });
  });
});
