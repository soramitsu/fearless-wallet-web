import { keyring } from '@polkadot/ui-keyring';
import type Extension from '@extension-base/background/handlers/Extension';

export function removeOldMobileWallets(extension: Extension) {
  keyring.getAddresses().forEach(({ address, meta }) => {
    if (meta.isMobile) {
      if (!meta.wcTopic) extension.accountsForget({ address, type: 'mobile' });
    }
  });
}
