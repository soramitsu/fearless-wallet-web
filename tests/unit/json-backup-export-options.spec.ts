import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
// The raw seed is offered once the background has exported it (derived-wallet-export-screens.spec.ts).
vi.mock('@/extension/messaging', () => ({ sendMessage: vi.fn(), exportRowSeed: vi.fn(async () => ({ seed: `0x${'11'.repeat(32)}` })) }));
import type { AccountJson } from '@extension-base/background/types/types';
import ExportTypeForm from '@/screens/accounts/ExportTypeForm.vue';
import { useAccountsStore } from '@/stores/accounts';

function form() {
  return mount(ExportTypeForm, { props: { password: 'public password' }, global: {
    mocks: { $t: (key: string) => key },
    stubs: { InfoRow: { props: ['text'], emits: ['click'], template: '<button @click="$emit(\'click\')">{{ text }}</button>' } },
  } });
}

describe('JSON-only recovery export choices', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('retains the internal unverified status through selection and only offers an encrypted JSON backup', async () => {
    const store = useAccountsStore();
    store.setSelectedWallet({ address: 'public fixture', name: 'Backup', isMnemonicUnverified: true,
      isMasterAccount: true, haveEntropy: true } as AccountJson);
    const wrapper = form();
    expect(wrapper.get('[role="note"]').text()).toBe('accounts.jsonBackupOnly');
    expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['accounts.json']);
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('setExportType')).toEqual([['json']]);
  });
  it('keeps verified mnemonic and raw-seed choices and refreshes when another account is selected', async () => {
    const store = useAccountsStore();
    store.setSelectedWallet({ address: 'public verified', isMasterAccount: true } as AccountJson);
    const wrapper = form();
    await flushPromises();
    expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['accounts.mnemonic', 'accounts.rawSeed', 'accounts.json']);
    store.setSelectedWallet({ address: 'public raw' } as AccountJson);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[role="note"]').exists()).toBe(false);
    expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['accounts.json']);
  });
});
