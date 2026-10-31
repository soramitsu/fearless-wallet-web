import SubscribableStore from '@extension-base/stores/SubscribableStore';
import { EXTENSION_PREFIX } from '@extension-base/defaults';
import type { NetworkJson } from '@extension-base/types';

export default class NetworkMapStore extends SubscribableStore<Record<string, NetworkJson>> {
  // Only this store reads or writes the network map, a ~217 KB record. Its writes do not hold up other stores' reads.
  static readonly ownQueue = { tail: Promise.resolve() };

  constructor() {
    super(EXTENSION_PREFIX ? `${EXTENSION_PREFIX}networkMap` : null);
  }
}
