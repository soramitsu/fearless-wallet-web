import type { Port } from '@extension-base/background/types/types';

const ports = new WeakMap<Port, number>();
let nextPort = 0;

// Request IDs come from pages. Only the background's port identity may scope a subscription;
// another site (or an old disconnected page) must never replace or cancel it by naming its ID.
export function subscriptionIdentity(id: string, port?: Port): string {
  if (!port) return `web:${id}`;
  let owner = ports.get(port);
  if (owner === undefined) {
    owner = ++nextPort;
    ports.set(port, owner);
  }
  return `${owner}:${id}`;
}
