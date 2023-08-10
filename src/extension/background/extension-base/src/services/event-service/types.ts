export interface EventRegistry {
  'crypto.ready': [boolean];
}

export type EventType = keyof EventRegistry;

export interface EventItem<T extends EventType> {
  type: T;
  data: EventRegistry[T];
}

export interface EventEmitterRegistry extends EventRegistry {
  lazy: EventItem<EventType>[];
}
