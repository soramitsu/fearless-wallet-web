import { removeOldMobileWallets } from '@extension-base/services/migration-service/migrations/mobile-wallets-v2';
import { extension } from '@extension-base/background/handlers';

export default class MigrationService {
  start() {
    removeOldMobileWallets(extension);
  }
}
