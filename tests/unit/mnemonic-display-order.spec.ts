import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MnemonicConfirmationForm from '@/screens/addWallet/MnemonicConfirmationForm.vue';
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

describe('recovery phrase confirmation', () => {
  const mountQuiz = (words: string[]) => mount(MnemonicConfirmationForm, {
    props: { mnemonic: words.join(' ') },
    global: { mocks: { $t: (key: string, args?: { position: number }) => args ? `Word ${args.position}` : key } },
  });

  it.each([12, 24])('checks three numbered words in a %i-word backup and lets you fix a single answer', async (count) => {
    const words = Array.from({ length: count }, (_, i) => `fixture-${i + 1}`);
    const wrapper = mountQuiz(words);
    const groups = wrapper.findAll('fieldset');
    const positions = groups.map((group) => Number(group.get('legend').text().split(' ')[1]));
    expect(groups).toHaveLength(3);
    expect(new Set(positions).size).toBe(3);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));

    const confirmed = () => wrapper.emitted('update:mnemonicConfirmed')?.at(-1);
    for (const [index, group] of groups.entries()) {
      expect(confirmed()).toEqual([false]);
      const choices = group.findAll<HTMLInputElement>('input[type=radio]').map((input) => input.element.value);
      expect(choices).toHaveLength(3);
      expect(new Set(choices).size).toBe(3);
      await group.get(`input[value="${words[positions[index] - 1]}"]`).setValue();
    }
    expect(confirmed()).toEqual([true]);

    const first = groups[0];
    const correct = words[positions[0] - 1];
    await first.get(`input:not([value="${correct}"])`).setValue();
    expect(first.get('[role=status]').text()).toBe('addWallet.tryAnotherWord');
    expect(confirmed()).toEqual([false]);
    await first.get(`input[value="${correct}"]`).setValue();
    expect(first.get('[role=status]').text()).toBe('');
    expect(confirmed()).toEqual([true]);
    wrapper.unmount();
  });

  it('offers distinct choices for repeated words and clears answers if the phrase changes', async () => {
    const words = [...Array<string>(11).fill('abandon'), 'about'];
    const wrapper = mountQuiz(words);
    for (const group of wrapper.findAll('fieldset')) {
      const position = Number(group.get('legend').text().split(' ')[1]);
      const choices = group.findAll('input').map((input) => input.element.value);
      expect(new Set(choices).size).toBe(3);
      await group.get(`input[value="${words[position - 1]}"]`).setValue();
    }
    expect(wrapper.emitted('update:mnemonicConfirmed')?.at(-1)).toEqual([true]);
    await wrapper.setProps({ mnemonic: Array<string>(12).fill('fixture').join(' ') });
    expect(wrapper.findAll('input:checked')).toHaveLength(0);
    expect(wrapper.emitted('update:mnemonicConfirmed')?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });
});
