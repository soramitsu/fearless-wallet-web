import { resolveUnlockRedirect } from '@/router/unlockRedirect';

describe('unlock redirect', () => {
  it('preserves an internal IrohaConnect review route', () => {
    expect(resolveUnlockRedirect('/fearless/settings/iroha-connect')).toBe('/fearless/settings/iroha-connect');
    expect(resolveUnlockRedirect(['/fearless/settings/iroha-connect', '/fearless/portfolio'])).toBe(
      '/fearless/settings/iroha-connect'
    );
  });

  it.each([undefined, null, '', 'https://uranai.sora.org', '//uranai.sora.org'])(
    'rejects unsafe or missing redirect %s',
    (value) => expect(resolveUnlockRedirect(value)).toBeUndefined()
  );
});
