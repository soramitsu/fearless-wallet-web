import type State from '@extension-base/background/handlers/State';
import type Extension from '@extension-base/background/handlers/Extension';

export function removeOldMobileWallets(extension: Extension, state: State) {
  state.keyringService.getAddresses().forEach(({ address, meta }) => {
    if (meta.isMobile) {
      if (!meta.wcTopic) extension.accountsForget({ address, type: 'mobile' });
    }
  });
}
