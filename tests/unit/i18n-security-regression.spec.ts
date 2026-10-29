import { createI18n } from 'vue-i18n';

// Regression cases from GHSA-83rm-6c8r-g728 and GHSA-8rc2-428q-7ww3.
// Parse into a detached template: inspect browser semantics without running HTML.
function translate(message: string, ...args: unknown[]): string {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    escapeParameter: true,
    warnHtmlMessage: false,
    messages: { en: { message } },
  });
  return Reflect.apply(i18n.global.t, i18n.global, ['message', ...args]);
}

describe('patched translation dependency', () => {
  it('neutralizes iframe srcdoc in translated HTML', () => {
    const template = document.createElement('template');
    template.innerHTML = translate('<iframe srcdoc="<b>unexpected document</b>"></iframe>');
    const frame = template.content.querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(frame!.hasAttribute('srcdoc')).toBe(false);
  });

  it('escapes named values when list parameters are also present', () => {
    const template = document.createElement('template');
    template.innerHTML = translate('{0} {name}', ['List'], {
      named: { name: '<form action="https://example.invalid"><input name="secret"></form>' },
    });
    expect(template.content.querySelector('form,input')).toBeNull();
    expect(template.content.textContent).toContain('<form');
  });

  it('preserves ordinary translations, named parameters, and pluralization', () => {
    expect(translate('Hello {name}', { name: 'Wallet' })).toBe('Hello Wallet');
    expect(translate('none | one token | {count} tokens', 3)).toBe('3 tokens');
  });
});
