import { requiresGenericUrlAuthorization } from '@extension-base/background/handlers/tabAuthorization';

describe('Iroha tab authorization bootstrap', () => {
  it.each([
    'iroha(authorizeUrl)',
    'iroha(accounts)',
    'iroha(disconnect)',
    'iroha(events.subscribe)',
  ] as const)('lets a fresh Iroha-only origin reach %s', (message) => {
    expect(requiresGenericUrlAuthorization(message)).toBe(false);
  });

  it('does not weaken the generic authorization guard for unrelated messages', () => {
    expect(requiresGenericUrlAuthorization('pub(accounts.list)')).toBe(true);
  });
});
