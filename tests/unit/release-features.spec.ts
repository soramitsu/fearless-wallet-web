import { afterEach, describe, expect, it } from 'vitest';

import {
  isBitcoinTransfersEnabled,
  isGoogleDriveBackupEnabled,
  isNetworkTransferEnabled,
} from '@/util/releaseFeatures';

const originalBitcoinFlag = process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS;
const originalOauthClientId = process.env.OAUTH_CLIENT_ID;

afterEach(() => {
  if (originalBitcoinFlag === undefined) delete process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS;
  else process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS = originalBitcoinFlag;

  if (originalOauthClientId === undefined) delete process.env.OAUTH_CLIENT_ID;
  else process.env.OAUTH_CLIENT_ID = originalOauthClientId;
});

describe('release feature gates', () => {
  it('enables Bitcoin transfers only for the exact reviewed true flag', () => {
    for (const value of [undefined, '', 'false', 'TRUE', '1']) {
      if (value === undefined) delete process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS;
      else process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS = value;

      expect(isBitcoinTransfersEnabled()).toBe(false);
    }

    process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS = 'true';
    expect(isBitcoinTransfersEnabled()).toBe(true);
  });

  it('removes Bitcoin networks from transfer selectors while keeping other ecosystems available', () => {
    process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS = 'false';
    expect(isNetworkTransferEnabled({ ecosystem: 'bitcoin' })).toBe(false);
    expect(isNetworkTransferEnabled({ ecosystem: 'substrate' })).toBe(true);
    expect(isNetworkTransferEnabled(undefined)).toBe(true);

    process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS = 'true';
    expect(isNetworkTransferEnabled({ ecosystem: 'bitcoin' })).toBe(true);
  });

  it('exposes Google Drive backup only when a non-empty OAuth client is built in', () => {
    for (const value of [undefined, '', '   ']) {
      if (value === undefined) delete process.env.OAUTH_CLIENT_ID;
      else process.env.OAUTH_CLIENT_ID = value;

      expect(isGoogleDriveBackupEnabled()).toBe(false);
    }

    process.env.OAUTH_CLIENT_ID = 'release-client.apps.googleusercontent.com';
    expect(isGoogleDriveBackupEnabled()).toBe(true);
  });
});
