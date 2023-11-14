import type { CurrentAccountState } from '@extension-base/stores/CurrentAccountStore';

export interface EventRegistry {
  'crypto.ready': [boolean];
  'keyring.ready': [boolean];
  'account.updateCurrent': [CurrentAccountState];
  'account.ready': [boolean];
  'account.add': [string]; // address
  'account.update': [string]; // address
  'account.remove': [string]; // address
}

export type EventType = keyof EventRegistry;

export interface EventItem<T extends EventType> {
  type: T;
  data: EventRegistry[T];
}

export interface EventEmitterRegistry extends EventRegistry {
  lazy: EventItem<EventType>[];
}
