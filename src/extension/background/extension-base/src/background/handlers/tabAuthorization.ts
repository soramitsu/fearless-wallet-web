import type { MessageTypes } from '@extension-base/background/types/types';

const AUTHORIZATION_BOOTSTRAP_MESSAGES = new Set<MessageTypes>([
  'pub(authorize.tab)',
  'evm(request)',
  'evm(authorizeUrl)',
  'solana(authorizeUrl)',
  'solana(accounts)',
  'solana(disconnect)',
  'solana(events.subscribe)',
  'iroha(authorizeUrl)',
  'iroha(accounts)',
  'iroha(disconnect)',
  'iroha(events.subscribe)',
]);

function requiresGenericUrlAuthorization(type: MessageTypes): boolean {
  return !AUTHORIZATION_BOOTSTRAP_MESSAGES.has(type);
}

export { requiresGenericUrlAuthorization };
