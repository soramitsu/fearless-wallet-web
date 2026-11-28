import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PasswordForm from '@/screens/addWallet/PasswordForm.vue';
import {
  MASTER_PASSWORD_MIN_LENGTH,
  MASTER_PASSWORD_SINGLE_KIND_MIN_LENGTH,
  isAcceptableNewMasterPassword,
} from '@/util/masterPasswordPolicy';

describe('new master password rule', () => {
  it('needs 8 characters of two kinds, or 12 of one kind', () => {
    expect(MASTER_PASSWORD_MIN_LENGTH).toBe(8);
    expect(MASTER_PASSWORD_SINGLE_KIND_MIN_LENGTH).toBe(12);
    for (const weak of ['', 'abc', 'Abc123', 'Passw0r', 'password', '12345678', 'qwertyuiop', 'ПАРОЛЬПАРОЛ', '🔐🔐🔐🔐🔐🔐🔐🔐']) {
      expect(isAcceptableNewMasterPassword(weak), weak).toBe(false);
    }
    for (const strong of ['Passw0rd', 'abcdefg1', 'correct horse', 'passwordpassword', '123456789012', 'пароль12', 'Pässwörd-日本語-🔐']) {
      expect(isAcceptableNewMasterPassword(strong), strong).toBe(true);
    }
  });

  it('counts Unicode characters, not UTF-16 units', () => {
    // Four emoji are eight UTF-16 units but four characters.
    expect(isAcceptableNewMasterPassword('🔐🔑🔐🔑')).toBe(false);
    expect(isAcceptableNewMasterPassword('あいうえおかきく')).toBe(false);
    expect(isAcceptableNewMasterPassword('あいうえおかきくけこさし')).toBe(true);
    expect(isAcceptableNewMasterPassword('日本語のパス12')).toBe(true);
  });
});

describe('PasswordForm', () => {
  const global = { mocks: { $t: (key: string) => key }, stubs: { Hint: true, ValidatedInput: true } };
  const typeInto = async (wrapper: ReturnType<typeof mount>, index: number, value: string) => {
    wrapper.findAllComponents({ name: 'ValidatedInput' })[index].vm.$emit('change', value);
    await wrapper.vm.$nextTick();
  };

  it('calls a password that is too easy to guess too short and emits nothing for it', async () => {
    const wrapper = mount(PasswordForm, { global, props: { focus: false } });
    await typeInto(wrapper, 0, 'password');
    const first = wrapper.findAllComponents({ name: 'ValidatedInput' })[0];
    expect(first.attributes('iserror')).toBe('true');
    expect(first.attributes('errordescriptions')).toBe('addWallet.shortPassword');
    await typeInto(wrapper, 1, 'password');
    expect(wrapper.emitted('setPassword')?.at(-1)).toEqual(['']);
  });

  it('emits a password of two kinds once it is confirmed', async () => {
    const wrapper = mount(PasswordForm, { global, props: { focus: false } });
    await typeInto(wrapper, 0, 'Passw0rd');
    expect(wrapper.findAllComponents({ name: 'ValidatedInput' })[0].attributes('iserror')).toBe('false');
    await typeInto(wrapper, 1, 'Passw0rd');
    expect(wrapper.emitted('setPassword')?.at(-1)).toEqual(['Passw0rd']);
  });
});
