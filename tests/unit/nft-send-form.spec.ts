import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CheckNftResponse } from '@extension-base/services/nft-service/types';
import NftSendForm from '@/screens/wallet&asset/nft/NftSendForm.vue';
const { checkNft, clipboard } = vi.hoisted(() => ({ checkNft: vi.fn(), clipboard: vi.fn() }));
vi.mock('@/extension/messaging/nfts', () => ({ checkNft }));
vi.mock('@/helpers', () => ({ cut: (value: string) => value, getClipboard: clipboard }));
vi.mock('@/router/routes', () => ({ Components: { Nfts: 'nfts' } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: '7', contract: 'contract', chainId: '1' } }), useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, n: (value: number) => String(value) }) }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ selectedWallet: { ethereumAddress: 'owner' }, acountsEcosystem: [], nfts: {} }) }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({ allNetworks: [], getNetwork: () => ({ assets: [{ symbol: 'eth', isUtility: true }] }) }) }));
vi.mock('@/portfolio/nftIdentity', () => ({ findNftCollection: () => ({ ownedNfts: [{ id: '7', type: 'ERC721', network: 'Ethereum', meta: {} }] }) }));
vi.mock('@/util/BaseApi', () => ({ default: { isSameAddress: () => false, validateAddress: () => true } }));
vi.mock('@/screens/wallet&asset/ConfirmationPasswordPopup.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/wallet&asset/HistoryBook.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/wallet&asset/EditAddressBook.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/main/WalletInfo.vue', () => ({ default: { template: '<div />' } }));
let wrapper: VueWrapper;
function deferred() { let resolve!: (value: CheckNftResponse) => void; const promise = new Promise<CheckNftResponse>(yes => { resolve = yes; }); return { promise, resolve }; }
async function mountForm() {
  checkNft.mockReset().mockResolvedValue({ fee: '', data: '0x', error: 'incorrectRecipient' });
  clipboard.mockReturnValue('recipient');
  wrapper = shallowMount(NftSendForm, { global: {
    mocks: { $t: (key: string) => key }, renderStubDefaultSlot: true,
    stubs: { AboveForm: { template: '<div><slot /></div>' }, FButton: { props: ['disabled', 'text'], template: '<button :disabled="disabled">{{ text }}</button>' }, BadgeButton: { template: '<button />' } },
  } });
  await flushPromises();
  return wrapper;
}
const button = () => wrapper.get('[data-testid="proceedBtn"]');
afterEach(() => wrapper?.unmount());
describe('NFT send form fee gating', () => {
  it('blocks sending while a quote is pending or failed, then recovers on a fresh quote', async () => {
    await mountForm();
    const pending = deferred(); checkNft.mockReturnValueOnce(pending.promise);
    await wrapper.get('[data-testid="pasteBtn"]').trigger('click');
    expect(button().attributes('disabled')).toBeDefined();
    pending.resolve({ fee: '', data: '0x', error: 'estimationFailed' }); await flushPromises();
    expect(button().attributes('disabled')).toBeDefined();
    expect(button().text()).toBe('common.estimateFeeError');
    clipboard.mockReturnValue('new-recipient'); checkNft.mockResolvedValueOnce({ fee: '0.001', data: '0x' });
    await wrapper.get('[data-testid="pasteBtn"]').trigger('click'); await flushPromises();
    expect(button().attributes('disabled')).toBeUndefined();
  });
  it('does not enable Send when an old recipient quote resolves', async () => {
    await mountForm();
    const old = deferred(), latest = deferred();
    checkNft.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    await wrapper.get('[data-testid="pasteBtn"]').trigger('click');
    clipboard.mockReturnValue('new-recipient'); await wrapper.get('[data-testid="pasteBtn"]').trigger('click');
    old.resolve({ fee: '0.001', data: '0x' }); await flushPromises();
    expect(button().attributes('disabled')).toBeDefined();
    latest.resolve({ fee: '0.002', data: '0x' }); await flushPromises();
    expect(button().attributes('disabled')).toBeUndefined();
    expect(checkNft).toHaveBeenLastCalledWith(expect.objectContaining({ to: 'new-recipient' }));
  });
  it('clears an old insufficient-funds error after a valid replacement quote', async () => {
    await mountForm();
    checkNft.mockResolvedValueOnce({ fee: '1', data: '0x', error: 'insufficientFunds' });
    await wrapper.get('[data-testid="pasteBtn"]').trigger('click'); await flushPromises();
    expect(button().attributes('disabled')).toBeDefined();
    clipboard.mockReturnValue('new-recipient'); checkNft.mockResolvedValueOnce({ fee: '0.001', data: '0x' });
    await wrapper.get('[data-testid="pasteBtn"]').trigger('click'); await flushPromises();
    expect(button().attributes('disabled')).toBeUndefined();
  });
});
