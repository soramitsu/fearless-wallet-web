import { expect, it } from 'vitest';
import { getTabAuthorizationTarget, stripUrl } from '@extension-base/background/helpers';
it('treats internal, malformed and credential-bearing pages as having no dApp authorization target', () => {
  for (const url of [undefined, '', 'about:blank', 'chrome://newtab', 'chrome-extension://extension/popup.html', 'file:///tmp/local.html', 'not a URL', 'https://user:password@example.com/']) {
    expect(getTabAuthorizationTarget(url)).toBeUndefined();
  }
  expect(() => stripUrl('about:blank')).toThrow();
  expect(() => stripUrl('https://user:password@example.com/')).toThrow();
});
it('keeps valid origins scheme-scoped for the read-only connection indicator', () => {
  expect(getTabAuthorizationTarget('https://dapp.example/swap')).toEqual({ key: 'https://dapp.example', hostname: 'dapp.example' });
  expect(getTabAuthorizationTarget('http://dapp.example/swap')).toEqual({ key: 'http://dapp.example', hostname: 'dapp.example' });
  expect(getTabAuthorizationTarget('ipfs://bafypublic/swap')).toEqual({ key: 'ipfs://bafypublic', hostname: 'bafypublic' });
});
