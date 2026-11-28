import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import productionRegistry from '../../remote-config/production/chains/v13/chains.json';
import type { NetworkJson } from '@extension-base/types';

const SUBSTRATE = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const EVM = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const TON = 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI';

const io = vi.hoisted(() => ({ network: null as unknown }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({ getNetwork: () => io.network }) }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ accounts: [], selectedWallet: {} }) }));
vi.mock('@/util/BaseApi', () => ({ default: { formatAddress: (_wallet: unknown, name: string) =>
  name === 'TON Mainnet' ? TON : ['Ethereum', 'BNB Smart Chain', 'ZetaChain Mainnet'].includes(name) ? EVM : SUBSTRATE } }));
vi.mock('@/router/routes', () => ({ Components: { Nodes: 'Nodes' } }));

import AccountSettingsPopup from '@/screens/accounts/AccountSettingsPopup.vue';

const registryRow = (name: string) => structuredClone((productionRegistry as unknown as NetworkJson[]).find((row) => row.name === name)!);
const mountMenu = (name: string) => {
  io.network = registryRow(name);
  return mount(AccountSettingsPopup, { props: { selectedNetwork: name, showCopyAddress: true }, global: {
    stubs: { Popup: { template: '<div><slot /></div>' }, Icon: true }, mocks: { $t: (key: string) => key, $router: { push: vi.fn() } },
  } });
};

describe('Account menu: view the account in the network explorer', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['Polkadot', 'accounts.subscan', `https://polkadot.subscan.io/account/${SUBSTRATE}`],
    ['KILT Spiritnet', 'accounts.subscan', `https://spiritnet.subscan.io/account/${SUBSTRATE}`],
    ['Ethereum', 'ux.openExplorer', `https://www.okx.com/web3/explorer/eth/address/${EVM}?channelID=flessw`],
    ['BNB Smart Chain', 'ux.openExplorer', `https://www.okx.com/web3/explorer/bsc/address/${EVM}?channelID=flessw`],
    ['ZetaChain Mainnet', 'accounts.etherscan', `https://zetachain.blockscout.com/address/${EVM}`],
    // Tonviewer shows an account at its own path, without a type segment.
    ['TON Mainnet', 'accounts.tonviewer', `https://tonviewer.com/${TON}`],
  ])('%s opens the account page of the explorer the registry names', async (name, label, url) => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const wrapper = mountMenu(name);
    const row = wrapper.get('[data-testid="viewIn"]');

    expect(row.text()).toBe(label);
    row.element.parentElement!.click();
    expect(open).toHaveBeenCalledExactlyOnceWith(url);
    expect(wrapper.emitted('handlerClose')).toHaveLength(1);
    wrapper.unmount();
  });

  it('offers no explorer link for a network the registry gives none', () => {
    const wrapper = mountMenu('Basilisk');

    expect(registryRow('Basilisk').externalApi?.explorers).toBeUndefined();
    expect(wrapper.find('[data-testid="viewIn"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
