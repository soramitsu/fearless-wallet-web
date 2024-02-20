import { EXTENSION_PREFIX } from '@extension-base/defaults';
import SubscribableStore from '@extension-base/stores/SubscribableStore';
import type { AuthUrls } from '@extension-base/background/types/types';

export default class AuthorizeStore extends SubscribableStore<AuthUrls> {
  constructor() {
    super(EXTENSION_PREFIX ? `${EXTENSION_PREFIX}authorize` : null);
  }
}
