import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MnemonicColumns from '@/screens/addWallet/MnemonicColumns.vue';

describe('recovery phrase numbering', () => {
  it.each([12, 24])('shows each of %i word positions exactly once in phrase order', (count) => {
    const words = Array.from({ length: count }, (_, index) => `fixture-${index + 1}`);
    const wrapper = mount(MnemonicColumns, { props: { mnemonicArray: words, mnemonicLength: count } });
    const rows = wrapper.findAll('.mnemonic-element');
    expect(rows.map((row) => Number(row.get('.mnemonic-number').text()))).toEqual(words.map((_, index) => index + 1));
    expect(rows.map((row) => row.get('[data-testid="mnemonicElement"]').text())).toEqual(words);
    wrapper.unmount();
  });
});
